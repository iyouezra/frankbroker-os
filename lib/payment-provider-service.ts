import { createHash } from "node:crypto";
import { Prisma } from "../app/generated/prisma/client";
import { lockPool, lockPosition, persistClientMoneyMutation } from "./client-money-service";
import { clientMoneyFunded, gatewayDepositConfirmed, gatewaySweptToPool } from "./gl/journal-rules";
import { postJournalEntry } from "./gl/posting-service";
import type { PaymentGateway } from "./integrations";
import { money, ZERO } from "./money";
import { lockAccount, persistCashMutation } from "./oms/persistence";
import { creditVerifiedDeposit } from "./oms/ledger-service";
import { writeAudit } from "./oms/audit-service";
import { prisma } from "./prisma";
import { getEffectiveAccountingPolicy } from "./accounting-policy";

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

export async function ingestPaymentProviderWebhook(input: {
  brokerId: string;
  actorId: string;
  provider: string;
  gateway: PaymentGateway;
  rawBody: string;
  headers: Headers;
}) {
  const verified = await input.gateway.verifyWebhook(input.rawBody, input.headers);
  if (!verified.valid) throw new Response("The payment-provider signature is invalid.", { status: 401 });
  const settlement = await input.gateway.describeSettlement(verified.providerEventId);
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.paymentProviderEvent.findUnique({
      where: { brokerId_provider_providerEventId: { brokerId: input.brokerId, provider: input.provider, providerEventId: verified.providerEventId } },
    });
    if (existing) return { eventId: existing.id, status: existing.processingStatus, idempotent: true };

    const policy = await getEffectiveAccountingPolicy(tx, input.brokerId);
    if (!policy) throw new Response("Approve an effective brokerage accounting policy before processing payment-provider money.", { status: 409 });
    if (policy.depositAvailabilityPoint !== "designated_bank_finality") throw new Response("The approved policy does not permit this deposit-availability workflow.", { status: 409 });
    const movement = await tx.cashMovement.findUnique({
      where: { brokerId_submissionReference: { brokerId: input.brokerId, submissionReference: settlement.reference } },
    });
    const gross = money(settlement.grossAmount);
    const fee = money(settlement.providerFee);
    const net = money(gross.minus(fee));
    if (gross.lte(0) || fee.lt(0) || net.lt(0)) throw new Response("The provider returned invalid settlement amounts.", { status: 409 });
    if (fee.gt(0) && policy.gatewayFeeTreatment !== "net_settlement_immediate_broker_funding") {
      throw new Response("The provider's net-settled fee conflicts with the approved accounting policy.", { status: 409 });
    }
    if (settlement.providerStatus === "bank_settled" && !settlement.finalityAt) throw new Response("A final settlement must include its finality timestamp.", { status: 409 });

    const event = await tx.paymentProviderEvent.create({ data: {
      id: crypto.randomUUID(), brokerId: input.brokerId, cashMovementId: movement?.id ?? null,
      provider: input.provider, providerEventId: verified.providerEventId, transactionId: settlement.transactionId,
      merchantReference: settlement.reference, eventType: verified.eventType, providerStatus: settlement.providerStatus,
      grossAmount: gross, providerFee: fee, netAmount: net, currency: settlement.currency,
      settlementBatchId: settlement.settlementBatchId ?? null, destinationAccountRef: settlement.destinationAccountRef ?? null,
      finalityAt: settlement.finalityAt ? new Date(settlement.finalityAt) : null,
      originalTransactionId: settlement.originalTransactionId ?? null, payloadHash,
      payload: verified.payload === null ? Prisma.JsonNull : verified.payload as Prisma.InputJsonValue,
      processingStatus: settlement.providerStatus === "bank_settled" ? "received" : "ignored",
      processedAt: settlement.providerStatus === "bank_settled" ? null : new Date(),
    } });

    if (settlement.providerStatus !== "bank_settled") return { eventId: event.id, status: "ignored", idempotent: false };
    if (!movement || movement.movementType !== "deposit" || movement.status !== "pending_verification") {
      throw new Response("The final provider event does not match a pending deposit instruction.", { status: 409 });
    }
    if (!movement.amount.eq(gross) || movement.currency !== settlement.currency) throw new Response("The provider settlement does not match the deposit amount or currency.", { status: 409 });

    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "cash_movements" WHERE "id" = ${movement.id} FOR UPDATE`);
    await lockAccount(tx, movement.accountId);
    await lockPool(tx, movement.pooledBankAccountId);
    const [account, pool] = await Promise.all([
      tx.account.findUniqueOrThrow({ where: { id: movement.accountId } }),
      tx.pooledBankAccount.findUniqueOrThrow({ where: { id: movement.pooledBankAccountId } }),
    ]);
    if (settlement.destinationAccountRef && ![pool.id, pool.accountNumberMasked].includes(settlement.destinationAccountRef)) {
      throw new Response("The provider settled to a different account than the designated client-money pool.", { status: 409 });
    }
    let position = await tx.clientMoneyPosition.findUnique({ where: { accountId_pooledBankAccountId: { accountId: account.id, pooledBankAccountId: pool.id } } });
    if (!position) position = await tx.clientMoneyPosition.create({ data: { id: crypto.randomUUID(), accountId: account.id, pooledBankAccountId: pool.id } });
    else {
      await lockPosition(tx, position.id);
      position = await tx.clientMoneyPosition.findUniqueOrThrow({ where: { id: position.id } });
    }

    await persistCashMutation(tx, {
      accountId: account.id, cashMovementId: movement.id, pooledBankAccountId: pool.id, actorId: input.actorId,
      valueDate: event.finalityAt ?? new Date(), reason: `${input.provider} final settlement ${settlement.transactionId}`,
      mutation: creditVerifiedDeposit({ total: account.totalCash, available: account.availableCash, blocked: account.blockedCash, unsettled: account.unsettledCash }, gross),
    });
    await persistClientMoneyMutation(tx, {
      position, pool, accountId: account.id, entryType: "deposit_credit", impact: gross, statementImpact: gross,
      markReconciled: true, actorId: input.actorId, cashMovementId: movement.id, bankReference: settlement.transactionId,
      notes: `${input.provider} final settlement; net receipt and broker fee funding total ${gross.toFixed(2)}`,
    });

    const valueDate = event.finalityAt ?? new Date();
    await postJournalEntry(tx, { brokerId: input.brokerId, actorId: input.actorId, cashMovementId: movement.id, accountId: account.id,
      draft: gatewayDepositConfirmed({ movementId: movement.id, clientAccountId: account.id, gross, providerFee: fee, valueDate, provider: input.provider }) });
    if (net.gt(ZERO)) await postJournalEntry(tx, { brokerId: input.brokerId, actorId: input.actorId, cashMovementId: movement.id,
      draft: gatewaySweptToPool({ sweepReference: settlement.transactionId, amount: net, pooledBankAccountId: pool.id, valueDate }) });
    if (fee.gt(ZERO)) await postJournalEntry(tx, { brokerId: input.brokerId, actorId: input.actorId, cashMovementId: movement.id,
      draft: clientMoneyFunded({ fundingId: `${settlement.transactionId}:fee`, pooledBankAccountId: pool.id, amount: fee, valueDate }) });

    await tx.cashMovement.update({ where: { id: movement.id }, data: {
      status: "completed", bankReference: settlement.transactionId, reviewedByUserId: input.actorId,
      completedByUserId: input.actorId, reviewedAt: new Date(), completedAt: new Date(),
    } });
    await tx.paymentProviderEvent.update({ where: { id: event.id }, data: { processingStatus: "processed", processedAt: new Date() } });
    await writeAudit(tx, { brokerId: input.brokerId, actorId: input.actorId, action: "PAYMENT_PROVIDER_DEPOSIT_SETTLED",
      entityType: "payment_provider_event", entityId: event.id, summary: `${gross.toFixed(2)} ${settlement.currency} settled finally through ${input.provider}`,
      newValue: { transactionId: settlement.transactionId, gross: gross.toFixed(), fee: fee.toFixed(), net: net.toFixed(), settlementBatchId: settlement.settlementBatchId ?? null } });
    return { eventId: event.id, status: "processed", idempotent: false };
  }, transactionOptions);
}
