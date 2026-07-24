import { Prisma } from "../app/generated/prisma/client";
import { money, toNum } from "./money";
import { prisma } from "./prisma";
import type { Actor } from "./server-auth";
import {
  completeWithdrawalCash,
  creditVerifiedDeposit,
  releaseWithdrawalCash,
  reserveWithdrawalCash,
  type CashSnapshot,
} from "./oms/ledger-service";
import { writeAudit } from "./oms/audit-service";
import { writeNotification, OPS } from "./oms/notification-service";
import { lockAccount, persistCashMutation } from "./oms/persistence";

export type CashMovementType = "deposit" | "withdrawal";
export type CashMovementInput = {
  clientId: string;
  accountId?: string;
  pooledBankAccountId: string;
  movementType: CashMovementType;
  amount: number | string;
  submissionReference: string;
  bankReference?: string;
  proofReference?: string;
  destinationBankName?: string;
  destinationAccountName?: string;
  destinationAccountMasked?: string;
  linkedBankAccountId?: string;
  notes?: string;
};

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

const fail = (message: string, status: number) => Response.json({ error: message }, { status });

const cashSnapshot = (account: { totalCash: Prisma.Decimal; availableCash: Prisma.Decimal; blockedCash: Prisma.Decimal; unsettledCash: Prisma.Decimal }): CashSnapshot => ({
  total: account.totalCash,
  available: account.availableCash,
  blocked: account.blockedCash,
  unsettled: account.unsettledCash,
});

function clean(value: string | undefined, max = 240) {
  const next = value?.trim() ?? "";
  return next ? next.slice(0, max) : null;
}

function assertInput(input: CashMovementInput) {
  const amount = money(input.amount);
  if (amount.lte(0)) throw fail("Amount must be greater than zero.", 400);
  if (!input.submissionReference.trim() || input.submissionReference.length > 120) {
    throw fail("A valid submission reference is required.", 400);
  }
  if (!input.pooledBankAccountId) throw fail("Select a pooled client-money account.", 400);
  if (input.movementType === "deposit" && !clean(input.bankReference, 120)) {
    throw fail("Enter the bank transfer or deposit-slip reference.", 400);
  }
  if (input.movementType === "withdrawal") {
    if (!input.linkedBankAccountId && (!clean(input.destinationBankName, 120) || !clean(input.destinationAccountName, 160) || !clean(input.destinationAccountMasked, 32))) {
      throw fail("Destination bank, account name, and masked account number are required.", 400);
    }
    if (!input.linkedBankAccountId && (input.destinationAccountMasked ?? "").replace(/\D/g, "").length < 4) {
      throw fail("Keep only at least the last four destination-account digits.", 400);
    }
  }
  return amount;
}

async function lockMovement(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "cash_movements" WHERE "id" = ${id} FOR UPDATE`);
}

async function lockPool(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "pooled_bank_accounts" WHERE "id" = ${id} FOR UPDATE`);
}

async function lockPosition(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "client_money_positions" WHERE "id" = ${id} FOR UPDATE`);
}

export function serializeCashMovement(movement: {
  id: string;
  movementType: string;
  amount: Prisma.Decimal;
  currency: string;
  status: string;
  bankReference: string | null;
  proofReference: string | null;
  destinationBankName: string | null;
  destinationAccountName: string | null;
  destinationAccountMasked: string | null;
  requestedByChannel: string;
  submissionReference: string;
  submittedAt: Date;
  reviewedAt: Date | null;
  completedAt: Date | null;
  rejectionReason: string | null;
  failureReason: string | null;
  notes: string | null;
  client?: { id: string; clientCode: string; fullName: string };
  account?: { id: string; accountNumber: string };
  pooledBankAccount?: { id: string; bankName: string; accountName: string; accountNumberMasked: string; purpose: string };
}) {
  return {
    id: movement.id,
    type: movement.movementType,
    amount: toNum(movement.amount),
    currency: movement.currency,
    status: movement.status,
    bankReference: movement.bankReference,
    proofReference: movement.proofReference,
    destinationBankName: movement.destinationBankName,
    destinationAccountName: movement.destinationAccountName,
    destinationAccountMasked: movement.destinationAccountMasked,
    channel: movement.requestedByChannel,
    submissionReference: movement.submissionReference,
    submittedAt: movement.submittedAt.toISOString(),
    reviewedAt: movement.reviewedAt?.toISOString() ?? null,
    completedAt: movement.completedAt?.toISOString() ?? null,
    rejectionReason: movement.rejectionReason,
    failureReason: movement.failureReason,
    notes: movement.notes,
    client: movement.client ? { id: movement.client.id, code: movement.client.clientCode, name: movement.client.fullName } : undefined,
    account: movement.account ? { id: movement.account.id, number: movement.account.accountNumber } : undefined,
    pool: movement.pooledBankAccount ? {
      id: movement.pooledBankAccount.id,
      bankName: movement.pooledBankAccount.bankName,
      accountName: movement.pooledBankAccount.accountName,
      accountNumberMasked: movement.pooledBankAccount.accountNumberMasked,
      purpose: movement.pooledBankAccount.purpose,
    } : undefined,
  };
}

/**
 * Record an investor-portal or broker-desk cash instruction. Deposits do not
 * alter any balance until verified. Withdrawals reserve available cash in the
 * same serializable transaction as the instruction, preventing double spend.
 */
export async function submitCashMovement(
  context: { brokerId: string; actorId: string | null; channel: "investor_portal" | "broker_desk" },
  input: CashMovementInput,
) {
  const amount = assertInput(input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.cashMovement.findUnique({
      where: { brokerId_submissionReference: { brokerId: context.brokerId, submissionReference: input.submissionReference.trim() } },
      include: { client: true, account: true, pooledBankAccount: true },
    });
    if (existing) {
      if (existing.clientId === input.clientId && existing.movementType === input.movementType && existing.amount.eq(amount)) return existing;
      throw fail("That submission reference is already used by a different instruction.", 409);
    }

    const client = await tx.client.findFirst({
      where: { id: input.clientId, brokerId: context.brokerId },
      include: { accounts: { orderBy: { createdAt: "asc" } } },
    });
    const account = input.accountId
      ? client?.accounts.find((item) => item.id === input.accountId)
      : client?.accounts[0];
    if (!client || !account) throw fail("Client cash account not found for this tenant.", 404);
    if (client.status !== "active" || client.kycStatus !== "approved" || account.status !== "active") {
      throw fail("Cash movements require an active, KYC-approved client account.", 409);
    }
    const pool = await tx.pooledBankAccount.findFirst({
      where: { id: input.pooledBankAccountId, brokerId: context.brokerId, status: "active", currency: account.currency },
    });
    if (!pool) throw fail("The selected pooled account is unavailable for this client.", 404);
    const linkedBank = input.movementType === "withdrawal" && input.linkedBankAccountId
      ? await tx.linkedBankAccount.findFirst({
        where: {
          id: input.linkedBankAccountId,
          clientId: client.id,
          brokerId: context.brokerId,
          status: "approved",
        },
      })
      : null;
    if (input.movementType === "withdrawal" && input.linkedBankAccountId && !linkedBank) {
      throw fail("Choose an approved linked bank account.", 409);
    }
    const destinationBankName = linkedBank?.bankName ?? clean(input.destinationBankName, 120);
    const destinationAccountName = linkedBank?.accountHolderName ?? clean(input.destinationAccountName, 160);
    const destinationAccountMasked = linkedBank
      ? `•••••• ${linkedBank.accountNumber.slice(-6)}`
      : clean(input.destinationAccountMasked, 32);

    await lockAccount(tx, account.id);
    const lockedAccount = await tx.account.findUniqueOrThrow({ where: { id: account.id } });
    const position = await tx.clientMoneyPosition.findUnique({
      where: { accountId_pooledBankAccountId: { accountId: account.id, pooledBankAccountId: pool.id } },
    });
    if (input.movementType === "withdrawal") {
      if (lockedAccount.availableCash.lt(amount)) throw fail("Withdrawal exceeds available cash.", 409);
      if (!position || position.balance.lt(amount)) throw fail("Withdrawal exceeds this account's beneficial balance in the selected pool.", 409);
    }

    const movement = await tx.cashMovement.create({
      data: {
        id: `MOV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        brokerId: context.brokerId,
        clientId: client.id,
        accountId: account.id,
        pooledBankAccountId: pool.id,
        submissionReference: input.submissionReference.trim(),
        movementType: input.movementType,
        amount,
        currency: account.currency,
        status: input.movementType === "deposit" ? "pending_verification" : "pending_approval",
        bankReference: clean(input.bankReference, 120),
        proofReference: clean(input.proofReference, 180),
        destinationBankName,
        destinationAccountName,
        destinationAccountMasked,
        linkedBankAccountId: linkedBank?.id ?? null,
        requestedByChannel: context.channel,
        submittedByUserId: context.actorId,
        notes: clean(input.notes, 500),
      },
      include: { client: true, account: true, pooledBankAccount: true },
    });

    if (input.movementType === "withdrawal") {
      await persistCashMutation(tx, {
        accountId: account.id,
        cashMovementId: movement.id,
        pooledBankAccountId: pool.id,
        actorId: context.actorId,
        valueDate: new Date(),
        reason: `Withdrawal ${movement.id} awaiting controlled approval and payment`,
        mutation: reserveWithdrawalCash(cashSnapshot(lockedAccount), amount),
      });
      await writeAudit(tx, {
        brokerId: context.brokerId, actorId: context.actorId, action: "WITHDRAWAL_CASH_BLOCKED",
        entityType: "cash_movement", entityId: movement.id,
        summary: `${amount.toFixed(2)} ${account.currency} reserved for ${client.fullName}'s withdrawal`,
        previousValue: { availableCash: toNum(lockedAccount.availableCash), blockedCash: toNum(lockedAccount.blockedCash) },
        newValue: { availableCash: toNum(lockedAccount.availableCash.minus(amount)), blockedCash: toNum(lockedAccount.blockedCash.plus(amount)) },
      });
    }

    await writeAudit(tx, {
      brokerId: context.brokerId,
      actorId: context.actorId,
      action: input.movementType === "deposit" ? "DEPOSIT_SUBMITTED" : "WITHDRAWAL_SUBMITTED",
      entityType: "cash_movement",
      entityId: movement.id,
      summary: `${input.movementType} instruction for ${client.fullName} recorded through ${context.channel.replaceAll("_", " ")}`,
      newValue: { amount: toNum(amount), currency: account.currency, status: movement.status, poolId: pool.id },
    });
    await writeNotification(tx, {
      scope: "broker", brokerId: context.brokerId, roles: OPS, category: "account", severity: "warning",
      title: input.movementType === "deposit" ? "Deposit needs verification" : "Withdrawal needs approval",
      body: `${client.fullName} · ${amount.toFixed(2)} ${account.currency}`,
      entityType: "cash_movement", entityId: movement.id, link: "/?view=cash",
    });
    return movement;
  }, transactionOptions);
}

export async function submitInvestorCashMovement(brokerId: string, clientId: string, input: Omit<CashMovementInput, "clientId">) {
  return submitCashMovement({ brokerId, actorId: null, channel: "investor_portal" }, { ...input, clientId });
}

export async function submitBrokerCashMovement(actor: Actor, input: CashMovementInput) {
  return submitCashMovement({ brokerId: actor.brokerId, actorId: actor.id, channel: "broker_desk" }, input);
}

type ReviewAction = "verify" | "approve" | "complete" | "reject" | "fail";

export async function reviewCashMovement(actor: Actor, id: string, action: ReviewAction, input: { reason?: string; bankReference?: string } = {}) {
  const reason = clean(input.reason, 500);
  return prisma.$transaction(async (tx) => {
    await lockMovement(tx, id);
    const movement = await tx.cashMovement.findFirst({
      where: { id, brokerId: actor.brokerId },
      include: { client: true, account: true, pooledBankAccount: true, submittedBy: true },
    });
    if (!movement) throw fail("Cash movement not found for this tenant.", 404);
    const settings = await tx.brokerSettings.findUnique({ where: { brokerId: actor.brokerId } });
    if (settings?.makerChecker && movement.submittedByUserId === actor.id) {
      throw fail("Maker-checker control requires another user to review this instruction.", 409);
    }

    await lockAccount(tx, movement.accountId);
    await lockPool(tx, movement.pooledBankAccountId);
    const [account, pool] = await Promise.all([
      tx.account.findUniqueOrThrow({ where: { id: movement.accountId } }),
      tx.pooledBankAccount.findUniqueOrThrow({ where: { id: movement.pooledBankAccountId } }),
    ]);
    const amount = money(movement.amount);
    const now = new Date();

    if (action === "verify") {
      if (movement.movementType !== "deposit" || movement.status !== "pending_verification") {
        throw fail("Only a pending deposit can be verified.", 409);
      }
      const bankReference = clean(input.bankReference, 120) ?? movement.bankReference;
      if (!bankReference) throw fail("Bank evidence reference is required before crediting a deposit.", 400);
      let position = await tx.clientMoneyPosition.findUnique({
        where: { accountId_pooledBankAccountId: { accountId: account.id, pooledBankAccountId: pool.id } },
      });
      if (!position) {
        position = await tx.clientMoneyPosition.create({ data: { id: crypto.randomUUID(), accountId: account.id, pooledBankAccountId: pool.id } });
      } else {
        await lockPosition(tx, position.id);
        position = await tx.clientMoneyPosition.findUniqueOrThrow({ where: { id: position.id } });
      }
      const nextPositionBalance = money(position.balance.plus(amount));
      const nextPoolBalance = money(pool.bookBalance.plus(amount));
      await persistCashMutation(tx, {
        accountId: account.id, cashMovementId: movement.id, pooledBankAccountId: pool.id,
        actorId: actor.id, valueDate: now, reason: `Verified against bank evidence ${bankReference}`,
        mutation: creditVerifiedDeposit(cashSnapshot(account), amount),
      });
      await tx.clientMoneyPosition.update({ where: { id: position.id }, data: { balance: nextPositionBalance, version: { increment: 1 } } });
      await tx.clientMoneyLedgerEntry.create({ data: {
        id: crypto.randomUUID(), positionId: position.id, accountId: account.id, pooledBankAccountId: pool.id,
        cashMovementId: movement.id, entryType: "deposit_credit", amount, balanceImpact: amount,
        runningBalance: nextPositionBalance, createdBy: actor.id, notes: `Verified bank reference ${bankReference}`,
      } });
      await tx.pooledBankAccount.update({ where: { id: pool.id }, data: {
        bookBalance: nextPoolBalance, statementBalance: money(pool.statementBalance.plus(amount)), version: { increment: 1 }, lastReconciledAt: now,
      } });
      await tx.pooledBankLedgerEntry.create({ data: {
        id: crypto.randomUUID(), pooledBankAccountId: pool.id, cashMovementId: movement.id,
        entryType: "deposit_credit", amount, balanceImpact: amount, runningBalance: nextPoolBalance,
        bankReference, createdBy: actor.id, notes: reason,
      } });
      const updated = await tx.cashMovement.update({ where: { id }, data: {
        status: "completed", bankReference, reviewedByUserId: actor.id, completedByUserId: actor.id,
        reviewedAt: now, completedAt: now,
      }, include: { client: true, account: true, pooledBankAccount: true } });
      await writeAudit(tx, {
        brokerId: actor.brokerId, actorId: actor.id, action: "DEPOSIT_VERIFIED_AND_CREDITED",
        entityType: "cash_movement", entityId: id, summary: `${amount.toFixed(2)} ${movement.currency} credited after bank verification`,
        previousValue: { status: movement.status, accountCash: toNum(account.totalCash), beneficialBalance: toNum(position.balance), poolBookBalance: toNum(pool.bookBalance) },
        newValue: { status: "completed", accountCash: toNum(account.totalCash.plus(amount)), beneficialBalance: toNum(nextPositionBalance), poolBookBalance: toNum(nextPoolBalance) },
        reason,
      });
      await writeNotification(tx, {
        scope: "investor", brokerId: actor.brokerId, clientId: movement.clientId, category: "account", severity: "success",
        title: "Deposit credited", body: `${amount.toFixed(2)} ${movement.currency} is now available to invest.`, entityType: "cash_movement", entityId: id,
      });
      return updated;
    }

    if (action === "approve") {
      if (movement.movementType !== "withdrawal" || movement.status !== "pending_approval") {
        throw fail("Only a pending withdrawal can be approved.", 409);
      }
      const updated = await tx.cashMovement.update({ where: { id }, data: { status: "approved", reviewedByUserId: actor.id, reviewedAt: now }, include: { client: true, account: true, pooledBankAccount: true } });
      await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "WITHDRAWAL_APPROVED", entityType: "cash_movement", entityId: id, summary: `${amount.toFixed(2)} ${movement.currency} withdrawal approved for payment`, previousValue: { status: movement.status }, newValue: { status: "approved" }, reason });
      await writeNotification(tx, { scope: "broker", brokerId: actor.brokerId, roles: OPS, category: "account", severity: "warning", title: "Withdrawal ready for payment", body: `${movement.client.fullName} · ${amount.toFixed(2)} ${movement.currency}`, entityType: "cash_movement", entityId: id, link: "/?view=cash" });
      return updated;
    }

    if (action === "complete") {
      if (movement.movementType !== "withdrawal" || movement.status !== "approved") {
        throw fail("Only an approved withdrawal can be marked paid.", 409);
      }
      const bankReference = clean(input.bankReference, 120);
      if (!bankReference) throw fail("Payment bank reference is required.", 400);
      const position = await tx.clientMoneyPosition.findUnique({ where: { accountId_pooledBankAccountId: { accountId: account.id, pooledBankAccountId: pool.id } } });
      if (!position) throw fail("Client beneficial balance record is missing.", 409);
      await lockPosition(tx, position.id);
      const lockedPosition = await tx.clientMoneyPosition.findUniqueOrThrow({ where: { id: position.id } });
      if (lockedPosition.balance.lt(amount) || pool.bookBalance.lt(amount) || pool.statementBalance.lt(amount)) {
        throw fail("The withdrawal exceeds the beneficial or pooled bank-book balance.", 409);
      }
      const nextPositionBalance = money(lockedPosition.balance.minus(amount));
      const nextPoolBalance = money(pool.bookBalance.minus(amount));
      await persistCashMutation(tx, {
        accountId: account.id, cashMovementId: id, pooledBankAccountId: pool.id,
        actorId: actor.id, valueDate: now, reason: `Paid under bank reference ${bankReference}`,
        mutation: completeWithdrawalCash(cashSnapshot(account), amount),
      });
      await tx.clientMoneyPosition.update({ where: { id: lockedPosition.id }, data: { balance: nextPositionBalance, version: { increment: 1 } } });
      await tx.clientMoneyLedgerEntry.create({ data: {
        id: crypto.randomUUID(), positionId: lockedPosition.id, accountId: account.id, pooledBankAccountId: pool.id,
        cashMovementId: id, entryType: "withdrawal_debit", amount: amount.negated(), balanceImpact: amount.negated(),
        runningBalance: nextPositionBalance, createdBy: actor.id, notes: `Paid under bank reference ${bankReference}`,
      } });
      await tx.pooledBankAccount.update({ where: { id: pool.id }, data: {
        bookBalance: nextPoolBalance, statementBalance: money(pool.statementBalance.minus(amount)), version: { increment: 1 }, lastReconciledAt: now,
      } });
      await tx.pooledBankLedgerEntry.create({ data: {
        id: crypto.randomUUID(), pooledBankAccountId: pool.id, cashMovementId: id,
        entryType: "withdrawal_debit", amount: amount.negated(), balanceImpact: amount.negated(), runningBalance: nextPoolBalance,
        bankReference, createdBy: actor.id, notes: reason,
      } });
      const updated = await tx.cashMovement.update({ where: { id }, data: { status: "completed", completedByUserId: actor.id, completedAt: now, bankReference }, include: { client: true, account: true, pooledBankAccount: true } });
      await writeAudit(tx, {
        brokerId: actor.brokerId, actorId: actor.id, action: "WITHDRAWAL_PAID_AND_DEBITED", entityType: "cash_movement", entityId: id,
        summary: `${amount.toFixed(2)} ${movement.currency} withdrawal paid and debited`,
        previousValue: { status: movement.status, accountCash: toNum(account.totalCash), beneficialBalance: toNum(lockedPosition.balance), poolBookBalance: toNum(pool.bookBalance) },
        newValue: { status: "completed", accountCash: toNum(account.totalCash.minus(amount)), beneficialBalance: toNum(nextPositionBalance), poolBookBalance: toNum(nextPoolBalance) }, reason,
      });
      await writeNotification(tx, { scope: "investor", brokerId: actor.brokerId, clientId: movement.clientId, category: "account", severity: "success", title: "Withdrawal paid", body: `${amount.toFixed(2)} ${movement.currency} was sent to your bank account ending ${movement.destinationAccountMasked ?? "on file"}.`, entityType: "cash_movement", entityId: id });
      return updated;
    }

    if (action === "reject" || action === "fail") {
      const allowed = action === "reject"
        ? (movement.movementType === "deposit" ? movement.status === "pending_verification" : movement.status === "pending_approval")
        : movement.movementType === "withdrawal" && movement.status === "approved";
      if (!allowed) throw fail(`This instruction cannot be marked ${action} from ${movement.status}.`, 409);
      if (!reason) throw fail("A reason is required.", 400);
      if (movement.movementType === "withdrawal") {
        await persistCashMutation(tx, {
          accountId: account.id, cashMovementId: id, pooledBankAccountId: pool.id, actorId: actor.id, valueDate: now,
          reason, mutation: releaseWithdrawalCash(cashSnapshot(account), amount, action === "reject" ? "Rejected withdrawal reservation released" : "Failed withdrawal reservation released"),
        });
        await writeAudit(tx, {
          brokerId: actor.brokerId, actorId: actor.id, action: "WITHDRAWAL_CASH_RELEASED", entityType: "cash_movement", entityId: id,
          summary: `${amount.toFixed(2)} ${movement.currency} returned to available cash`,
          previousValue: { availableCash: toNum(account.availableCash), blockedCash: toNum(account.blockedCash) },
          newValue: { availableCash: toNum(account.availableCash.plus(amount)), blockedCash: toNum(account.blockedCash.minus(amount)) }, reason,
        });
      }
      const status = action === "reject" ? "rejected" : "failed";
      const updated = await tx.cashMovement.update({ where: { id }, data: {
        status, reviewedByUserId: actor.id, reviewedAt: now,
        ...(action === "reject" ? { rejectionReason: reason } : { failureReason: reason, completedByUserId: actor.id, completedAt: now }),
      }, include: { client: true, account: true, pooledBankAccount: true } });
      await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: action === "reject" ? `${movement.movementType.toUpperCase()}_REJECTED` : "WITHDRAWAL_PAYMENT_FAILED", entityType: "cash_movement", entityId: id, summary: `${movement.movementType} instruction marked ${status}`, previousValue: { status: movement.status }, newValue: { status }, reason });
      await writeNotification(tx, { scope: "investor", brokerId: actor.brokerId, clientId: movement.clientId, category: "account", severity: action === "fail" ? "critical" : "warning", title: `${movement.movementType === "deposit" ? "Deposit" : "Withdrawal"} ${status}`, body: reason, entityType: "cash_movement", entityId: id });
      return updated;
    }

    throw fail("Unsupported cash movement action.", 400);
  }, transactionOptions);
}
