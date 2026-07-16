import { Prisma } from "../../app/generated/prisma/client";
import type { CashMutation, SecuritiesMutation } from "./ledger-service";

export async function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`);
}

export async function lockAccount(tx: Prisma.TransactionClient, accountId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "accounts" WHERE "id" = ${accountId} FOR UPDATE`);
}

export async function lockHolding(tx: Prisma.TransactionClient, accountId: string, instrumentId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "holdings" WHERE "account_id" = ${accountId} AND "instrument_id" = ${instrumentId} FOR UPDATE`,
  );
}

export async function persistCashMutation(
  tx: Prisma.TransactionClient,
  input: {
    accountId: string;
    orderId?: string | null;
    tradeId?: string | null;
    actorId: string;
    valueDate: Date;
    reason?: string | null;
    mutation: CashMutation;
  },
) {
  await tx.account.update({
    where: { id: input.accountId },
    data: {
      totalCash: input.mutation.next.total,
      availableCash: input.mutation.next.available,
      blockedCash: input.mutation.next.blocked,
      unsettledCash: input.mutation.next.unsettled,
      version: { increment: 1 },
    },
  });
  if (!input.mutation.entries.length) return;
  await tx.cashLedgerEntry.createMany({
    data: input.mutation.entries.map((entry) => ({
      id: crypto.randomUUID(),
      accountId: input.accountId,
      orderId: input.orderId ?? null,
      tradeId: input.tradeId ?? null,
      entryType: entry.entryType,
      amount: entry.amount,
      totalImpact: entry.totalImpact,
      availableImpact: entry.availableImpact,
      blockedImpact: entry.blockedImpact,
      unsettledImpact: entry.unsettledImpact,
      runningBalance: entry.runningBalance,
      description: entry.description,
      reason: input.reason ?? null,
      valueDate: input.valueDate,
      createdBy: input.actorId,
    })),
  });
}

export async function persistSecuritiesMutation(
  tx: Prisma.TransactionClient,
  input: {
    holdingId: string;
    accountId: string;
    instrumentId: string;
    orderId?: string | null;
    tradeId?: string | null;
    actorId: string;
    valueDate: Date;
    reason?: string | null;
    averageCost?: Prisma.Decimal;
    mutation: SecuritiesMutation;
  },
) {
  await tx.holding.update({
    where: { id: input.holdingId },
    data: {
      totalQuantity: input.mutation.next.total,
      availableQuantity: input.mutation.next.available,
      blockedQuantity: input.mutation.next.blocked,
      unsettledQuantity: input.mutation.next.unsettled,
      ...(input.averageCost ? { averageCost: input.averageCost } : {}),
      version: { increment: 1 },
    },
  });
  if (!input.mutation.entries.length) return;
  await tx.securitiesLedgerEntry.createMany({
    data: input.mutation.entries.map((entry) => ({
      id: crypto.randomUUID(),
      accountId: input.accountId,
      instrumentId: input.instrumentId,
      orderId: input.orderId ?? null,
      tradeId: input.tradeId ?? null,
      entryType: entry.entryType,
      quantity: entry.quantity,
      totalImpact: entry.totalImpact,
      availableImpact: entry.availableImpact,
      blockedImpact: entry.blockedImpact,
      unsettledImpact: entry.unsettledImpact,
      runningQuantity: entry.runningQuantity,
      description: entry.description,
      reason: input.reason ?? null,
      valueDate: input.valueDate,
      createdBy: input.actorId,
    })),
  });
}
