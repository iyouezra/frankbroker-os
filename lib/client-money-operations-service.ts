import { Prisma } from "../app/generated/prisma/client";
import { lockPool, lockPosition, persistBeneficialAllocation, persistPoolOnlyMutation } from "./client-money-service";
import { brokerFeesSwept, clientMoneyFunded, feeRemitted, LEDGER_ROLES, unidentifiedReceiptAllocated, unidentifiedReceiptRecorded } from "./gl/journal-rules";
import { postJournalEntry } from "./gl/posting-service";
import { buildProtectedClientMoneyCoverage, buildTrialBalance } from "./gl/ledger-reporting";
import { D, money, type DecimalValue } from "./money";
import { creditVerifiedDeposit } from "./oms/ledger-service";
import { lockAccount, persistCashMutation } from "./oms/persistence";
import { prisma } from "./prisma";

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

async function assertIndependentApproval(tx: Prisma.TransactionClient, brokerId: string, actorId: string, approverId: string) {
  const settings = await tx.brokerSettings.findUnique({ where: { brokerId }, select: { makerChecker: true } });
  if (settings?.makerChecker !== false && actorId === approverId) throw new Response("Maker-checker control requires another user to approve this client-money operation.", { status: 409 });
}

export async function recordUnidentifiedClientReceipt(input: { brokerId: string; actorId: string; approverId: string; receiptId: string; pooledBankAccountId: string; amount: string | number; bankReference: string; valueDate: Date }) {
  const amount = money(input.amount);
  if (amount.lte(0)) throw new Response("Receipt amount must be positive.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    await assertIndependentApproval(tx, input.brokerId, input.actorId, input.approverId);
    await lockPool(tx, input.pooledBankAccountId);
    const pool = await tx.pooledBankAccount.findFirstOrThrow({ where: { id: input.pooledBankAccountId, brokerId: input.brokerId, status: "active" } });
    await persistPoolOnlyMutation(tx, { pool, entryType: "unidentified_receipt", bookImpact: amount, statementImpact: amount, actorId: input.actorId, bankReference: input.bankReference, notes: `Unidentified receipt ${input.receiptId}` });
    return postJournalEntry(tx, { brokerId: input.brokerId, actorId: input.actorId, approverId: input.approverId,
      draft: unidentifiedReceiptRecorded({ receiptId: input.receiptId, pooledBankAccountId: pool.id, amount, bankReference: input.bankReference, valueDate: input.valueDate }) });
  }, transactionOptions);
}

export async function allocateUnidentifiedClientReceipt(input: { brokerId: string; actorId: string; approverId: string; receiptId: string; accountId: string; pooledBankAccountId: string; amount: string | number; valueDate: Date }) {
  const amount = money(input.amount);
  if (amount.lte(0)) throw new Response("Allocation amount must be positive.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    await assertIndependentApproval(tx, input.brokerId, input.actorId, input.approverId);
    await lockAccount(tx, input.accountId);
    await lockPool(tx, input.pooledBankAccountId);
    const [account, pool, suspense] = await Promise.all([
      tx.account.findFirstOrThrow({ where: { id: input.accountId, client: { brokerId: input.brokerId } } }),
      tx.pooledBankAccount.findFirstOrThrow({ where: { id: input.pooledBankAccountId, brokerId: input.brokerId } }),
      tx.ledgerAccount.findUniqueOrThrow({ where: { brokerId_role: { brokerId: input.brokerId, role: LEDGER_ROLES.unidentifiedReceipts } } }),
    ]);
    if (suspense.balance.negated().lt(amount)) throw new Response("The allocation exceeds unidentified receipts recorded in the ledger.", { status: 409 });
    let position = await tx.clientMoneyPosition.findUnique({ where: { accountId_pooledBankAccountId: { accountId: account.id, pooledBankAccountId: pool.id } } });
    if (!position) position = await tx.clientMoneyPosition.create({ data: { id: crypto.randomUUID(), accountId: account.id, pooledBankAccountId: pool.id } });
    else { await lockPosition(tx, position.id); position = await tx.clientMoneyPosition.findUniqueOrThrow({ where: { id: position.id } }); }
    await persistCashMutation(tx, { accountId: account.id, pooledBankAccountId: pool.id, actorId: input.actorId, valueDate: input.valueDate,
      reason: `Unidentified receipt ${input.receiptId} allocated`, mutation: creditVerifiedDeposit({ total: account.totalCash, available: account.availableCash, blocked: account.blockedCash, unsettled: account.unsettledCash }, amount) });
    await persistBeneficialAllocation(tx, { position, accountId: account.id, pooledBankAccountId: pool.id, amount, actorId: input.actorId, notes: `Allocated receipt ${input.receiptId}` });
    return postJournalEntry(tx, { brokerId: input.brokerId, actorId: input.actorId, approverId: input.approverId, accountId: account.id,
      draft: unidentifiedReceiptAllocated({ receiptId: input.receiptId, clientAccountId: account.id, amount, valueDate: input.valueDate }) });
  }, transactionOptions);
}

export function chargeSweepLimit(input: { protectedSurplus: DecimalValue; collectedCharges: DecimalValue; previousSweeps: DecimalValue; poolBookBalance: DecimalValue; poolStatementBalance: DecimalValue }) {
  const unsweptCharges = money(D(input.collectedCharges).minus(input.previousSweeps));
  return money(Prisma.Decimal.max(0, Prisma.Decimal.min(
    D(input.protectedSurplus), unsweptCharges, D(input.poolBookBalance), D(input.poolStatementBalance),
  )));
}

export async function sweepCollectedClientCharges(input: { brokerId: string; actorId: string; approverId: string; sweepId: string; pooledBankAccountId: string; valueDate: Date }) {
  return prisma.$transaction(async (tx) => {
    await assertIndependentApproval(tx, input.brokerId, input.actorId, input.approverId);
    await lockPool(tx, input.pooledBankAccountId);
    const pool = await tx.pooledBankAccount.findFirstOrThrow({ where: { id: input.pooledBankAccountId, brokerId: input.brokerId } });
    if (!pool.lastReconciledAt) throw new Response("Reconcile the client bank account before withdrawing collected charges.", { status: 409 });
    const [trialBalance, collected, swept] = await Promise.all([
      buildTrialBalance(tx, input.brokerId),
      tx.journalLine.aggregate({
        where: { brokerId: input.brokerId, side: "credit", entry: { sourceType: "trade_capture", status: "posted" }, ledgerAccount: { role: { in: [LEDGER_ROLES.brokerageIncome, LEDGER_ROLES.ecmaLevyPayable, LEDGER_ROLES.esxFeePayable, LEDGER_ROLES.csdFeePayable] } } },
        _sum: { amount: true },
      }),
      tx.journalLine.aggregate({
        where: { brokerId: input.brokerId, side: "debit", entry: { sourceType: "fee_sweep", status: "posted" }, ledgerAccount: { role: LEDGER_ROLES.brokerOperatingBank } },
        _sum: { amount: true },
      }),
    ]);
    const coverage = buildProtectedClientMoneyCoverage(trialBalance);
    if (!coverage.adequate) throw new Response("Collected charges cannot be swept while protected client money has a shortfall.", { status: 409 });
    const amount = chargeSweepLimit({
      protectedSurplus: coverage.surplus,
      collectedCharges: collected._sum.amount ?? 0,
      previousSweeps: swept._sum.amount ?? 0,
      poolBookBalance: pool.bookBalance,
      poolStatementBalance: pool.statementBalance,
    });
    if (amount.lte(0)) throw new Response("There is no reconciled, unswept charge balance available to withdraw.", { status: 409 });
    await persistPoolOnlyMutation(tx, { pool, entryType: "collected_charges_sweep", bookImpact: amount.negated(), statementImpact: amount.negated(), actorId: input.actorId, notes: `Collected charges sweep ${input.sweepId}` });
    const journal = await postJournalEntry(tx, { brokerId: input.brokerId, actorId: input.actorId, approverId: input.approverId,
      draft: brokerFeesSwept({ sweepId: input.sweepId, pooledBankAccountId: pool.id, amount, valueDate: input.valueDate }) });
    return { ...journal, amount: amount.toFixed(2), protectedSurplusBeforeSweep: money(coverage.surplus).toFixed(2) };
  }, transactionOptions);
}

export async function remitCollectedMarketFee(input: { brokerId: string; actorId: string; approverId: string; remittanceId: string; payee: "ecma" | "esx" | "csd"; amount: string | number; valueDate: Date }) {
  const amount = money(input.amount);
  if (amount.lte(0)) throw new Response("Remittance amount must be positive.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    await assertIndependentApproval(tx, input.brokerId, input.actorId, input.approverId);
    return postJournalEntry(tx, { brokerId: input.brokerId, actorId: input.actorId, approverId: input.approverId,
      draft: feeRemitted({ remittanceId: input.remittanceId, payee: input.payee, amount, valueDate: input.valueDate }) });
  }, transactionOptions);
}

export async function fundClientMoneyShortfall(input: { brokerId: string; actorId: string; approverId: string; fundingId: string; pooledBankAccountId: string; amount: string | number; valueDate: Date }) {
  const amount = money(input.amount);
  if (amount.lte(0)) throw new Response("Funding amount must be positive.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    await assertIndependentApproval(tx, input.brokerId, input.actorId, input.approverId);
    await lockPool(tx, input.pooledBankAccountId);
    const pool = await tx.pooledBankAccount.findFirstOrThrow({ where: { id: input.pooledBankAccountId, brokerId: input.brokerId } });
    await persistPoolOnlyMutation(tx, { pool, entryType: "broker_shortfall_funding", bookImpact: amount, statementImpact: amount, actorId: input.actorId, notes: `Shortfall funding ${input.fundingId}` });
    return postJournalEntry(tx, { brokerId: input.brokerId, actorId: input.actorId, approverId: input.approverId,
      draft: clientMoneyFunded({ fundingId: input.fundingId, pooledBankAccountId: pool.id, amount, valueDate: input.valueDate }) });
  }, transactionOptions);
}
