import { Prisma } from "../app/generated/prisma/client";
import { money, toNum, ZERO } from "./money";
import { writeAudit } from "./oms/audit-service";

const fail = (message: string, status = 409) => Response.json({ error: message }, { status });

export async function lockPool(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "pooled_bank_accounts" WHERE "id" = ${id} FOR UPDATE`);
}

export async function lockPosition(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "client_money_positions" WHERE "id" = ${id} FOR UPDATE`);
}

export type ClientMoneyEntryType = "deposit_credit" | "withdrawal_debit" | "trade_debit" | "trade_credit" | "receipt_allocation" | "corporate_action_credit";

/**
 * The single choke point for beneficial-owner and pooled-bank book movements.
 * Mirrors `persistCashMutation`: it takes an open transaction, never opens its
 * own, and expects the caller to have locked the position and pool already.
 *
 * `impact` moves both the client's beneficial balance and the pooled book
 * balance. `statementImpact` moves the independently confirmed bank balance and
 * defaults to zero, because most events change our book long before the bank
 * confirms them.
 */
export async function persistClientMoneyMutation(
  tx: Prisma.TransactionClient,
  input: {
    position: { id: string; balance: Prisma.Decimal };
    pool: { id: string; bookBalance: Prisma.Decimal; statementBalance: Prisma.Decimal };
    accountId: string;
    entryType: ClientMoneyEntryType;
    impact: Prisma.Decimal;
    statementImpact?: Prisma.Decimal;
    markReconciled?: boolean;
    actorId: string;
    orderId?: string | null;
    tradeId?: string | null;
    cashMovementId?: string | null;
    bankReference?: string | null;
    notes?: string | null;
    poolNotes?: string | null;
    negativeBalanceMessage?: string;
  },
) {
  const impact = money(input.impact);
  const statementImpact = money(input.statementImpact ?? ZERO);
  const nextPositionBalance = money(input.position.balance.plus(impact));
  const nextPoolBookBalance = money(input.pool.bookBalance.plus(impact));
  const nextStatementBalance = money(input.pool.statementBalance.plus(statementImpact));
  if (nextPositionBalance.lt(0) || nextPoolBookBalance.lt(0) || nextStatementBalance.lt(0)) {
    throw fail(input.negativeBalanceMessage ?? "This movement would make a client-money balance negative.");
  }

  await tx.clientMoneyPosition.update({
    where: { id: input.position.id },
    data: { balance: nextPositionBalance, version: { increment: 1 } },
  });
  await tx.pooledBankAccount.update({
    where: { id: input.pool.id },
    data: {
      bookBalance: nextPoolBookBalance,
      statementBalance: nextStatementBalance,
      version: { increment: 1 },
      ...(input.markReconciled ? { lastReconciledAt: new Date() } : {}),
    },
  });
  await tx.clientMoneyLedgerEntry.create({
    data: {
      id: crypto.randomUUID(),
      positionId: input.position.id,
      accountId: input.accountId,
      pooledBankAccountId: input.pool.id,
      cashMovementId: input.cashMovementId ?? null,
      orderId: input.orderId ?? null,
      tradeId: input.tradeId ?? null,
      entryType: input.entryType,
      amount: impact,
      balanceImpact: impact,
      runningBalance: nextPositionBalance,
      createdBy: input.actorId,
      notes: input.notes ?? null,
    },
  });
  await tx.pooledBankLedgerEntry.create({
    data: {
      id: crypto.randomUUID(),
      pooledBankAccountId: input.pool.id,
      cashMovementId: input.cashMovementId ?? null,
      orderId: input.orderId ?? null,
      tradeId: input.tradeId ?? null,
      entryType: input.entryType,
      amount: impact,
      balanceImpact: impact,
      runningBalance: nextPoolBookBalance,
      bankReference: input.bankReference ?? null,
      createdBy: input.actorId,
      notes: input.poolNotes ?? input.notes ?? null,
    },
  });
  return { nextPositionBalance, nextPoolBookBalance, nextStatementBalance };
}

/**
 * Move only the externally confirmed side of a pooled bank account. The book
 * balance is untouched, so the ledger row carries a zero balance impact and
 * records the unchanged book balance as its running balance.
 */
export async function persistPooledStatementMutation(
  tx: Prisma.TransactionClient,
  input: {
    pool: { id: string; bookBalance: Prisma.Decimal; statementBalance: Prisma.Decimal };
    entryType: string;
    statementImpact: Prisma.Decimal;
    actorId: string;
    orderId?: string | null;
    tradeId?: string | null;
    cashMovementId?: string | null;
    bankReference?: string | null;
    notes?: string | null;
    negativeBalanceMessage?: string;
  },
) {
  const statementImpact = money(input.statementImpact);
  const nextStatementBalance = money(input.pool.statementBalance.plus(statementImpact));
  if (nextStatementBalance.lt(0)) {
    throw fail(input.negativeBalanceMessage ?? "This movement would make the confirmed pooled bank balance negative.");
  }
  await tx.pooledBankAccount.update({
    where: { id: input.pool.id },
    data: { statementBalance: nextStatementBalance, lastReconciledAt: new Date(), version: { increment: 1 } },
  });
  await tx.pooledBankLedgerEntry.create({
    data: {
      id: crypto.randomUUID(),
      pooledBankAccountId: input.pool.id,
      cashMovementId: input.cashMovementId ?? null,
      orderId: input.orderId ?? null,
      tradeId: input.tradeId ?? null,
      entryType: input.entryType,
      amount: statementImpact,
      balanceImpact: ZERO,
      runningBalance: input.pool.bookBalance,
      bankReference: input.bankReference ?? null,
      createdBy: input.actorId,
      notes: input.notes ?? null,
    },
  });
  return { nextStatementBalance };
}

/** Move a pooled account without changing any identified client's balance. */
export async function persistPoolOnlyMutation(
  tx: Prisma.TransactionClient,
  input: {
    pool: { id: string; bookBalance: Prisma.Decimal; statementBalance: Prisma.Decimal };
    entryType: string;
    bookImpact: Prisma.Decimal;
    statementImpact: Prisma.Decimal;
    actorId: string;
    bankReference?: string | null;
    notes?: string | null;
  },
) {
  const bookImpact = money(input.bookImpact);
  const statementImpact = money(input.statementImpact);
  const nextBookBalance = money(input.pool.bookBalance.plus(bookImpact));
  const nextStatementBalance = money(input.pool.statementBalance.plus(statementImpact));
  if (nextBookBalance.lt(0) || nextStatementBalance.lt(0)) throw fail("This movement would make a pooled client-money balance negative.");
  await tx.pooledBankAccount.update({
    where: { id: input.pool.id },
    data: { bookBalance: nextBookBalance, statementBalance: nextStatementBalance, lastReconciledAt: new Date(), version: { increment: 1 } },
  });
  await tx.pooledBankLedgerEntry.create({ data: {
    id: crypto.randomUUID(), pooledBankAccountId: input.pool.id, entryType: input.entryType,
    amount: bookImpact, balanceImpact: bookImpact, runningBalance: nextBookBalance,
    bankReference: input.bankReference ?? null, createdBy: input.actorId, notes: input.notes ?? null,
  } });
  return { nextBookBalance, nextStatementBalance };
}

/** Allocate money already present in a pool to its identified beneficial owner. */
export async function persistBeneficialAllocation(
  tx: Prisma.TransactionClient,
  input: { position: { id: string; balance: Prisma.Decimal }; accountId: string; pooledBankAccountId: string; amount: Prisma.Decimal; actorId: string; notes?: string },
) {
  const amount = money(input.amount);
  if (amount.lte(0)) throw fail("A beneficial allocation must be positive.", 400);
  const nextBalance = money(input.position.balance.plus(amount));
  await tx.clientMoneyPosition.update({ where: { id: input.position.id }, data: { balance: nextBalance, version: { increment: 1 } } });
  await tx.clientMoneyLedgerEntry.create({ data: {
    id: crypto.randomUUID(), positionId: input.position.id, accountId: input.accountId,
    pooledBankAccountId: input.pooledBankAccountId, entryType: "receipt_allocation",
    amount, balanceImpact: amount, runningBalance: nextBalance, createdBy: input.actorId, notes: input.notes ?? null,
  } });
  return { nextBalance };
}

/**
 * Mirror the cash impact of a captured trade into the beneficial-owner and
 * pooled-bank books. The external statement balance moves later, when the cash
 * settlement leg is confirmed.
 */
export async function applyClientMoneyTradeBook(
  tx: Prisma.TransactionClient,
  input: {
    brokerId: string;
    accountId: string;
    orderId: string;
    tradeId: string;
    actorId: string;
    impact: Prisma.Decimal;
    assetClass: string;
  },
) {
  const impact = money(input.impact);
  if (impact.isZero()) return;
  const preferredPurpose = input.assetClass === "bond" ? "fixed_income" : "general";
  const pools = await tx.pooledBankAccount.findMany({
    where: { brokerId: input.brokerId, status: "active", currency: "ETB" },
    include: { positions: { where: { accountId: input.accountId } } },
    orderBy: { id: "asc" },
  });
  if (!pools.length) throw fail("Configure an active pooled client-money account before capturing trades.");
  for (const pool of pools) await lockPool(tx, pool.id);
  for (const position of pools.flatMap((pool) => pool.positions).sort((left, right) => left.id.localeCompare(right.id))) await lockPosition(tx, position.id);

  const lockedPools = await tx.pooledBankAccount.findMany({
    where: { id: { in: pools.map((pool) => pool.id) } },
    include: { positions: { where: { accountId: input.accountId } } },
  });
  const ordered = lockedPools.sort((left, right) => {
    const leftRank = left.purpose === preferredPurpose ? 0 : left.purpose === "general" ? 1 : 2;
    const rightRank = right.purpose === preferredPurpose ? 0 : right.purpose === "general" ? 1 : 2;
    return leftRank - rightRank || left.id.localeCompare(right.id);
  });

  type PoolWithPositions = (typeof ordered)[number];
  type Position = PoolWithPositions["positions"][number];
  const allocations: Array<{ pool: PoolWithPositions; position: Position; impact: Prisma.Decimal }> = [];
  if (impact.lt(0)) {
    let remaining = impact.abs();
    const beneficialTotal = ordered.reduce((sum, pool) => sum.plus(pool.positions[0]?.balance ?? ZERO), ZERO);
    if (beneficialTotal.lt(remaining)) throw fail("Trade debit exceeds the client's beneficial cash held in pooled accounts.");
    for (const pool of ordered) {
      const position = pool.positions[0];
      if (!position || remaining.isZero()) continue;
      const debit = Prisma.Decimal.min(position.balance, remaining);
      if (debit.gt(0)) allocations.push({ pool, position, impact: money(debit.negated()) });
      remaining = remaining.minus(debit);
    }
  } else {
    const pool = ordered[0];
    let position = pool.positions[0];
    if (!position) {
      position = await tx.clientMoneyPosition.create({ data: { id: crypto.randomUUID(), accountId: input.accountId, pooledBankAccountId: pool.id } });
    }
    allocations.push({ pool, position, impact });
  }

  for (const allocation of allocations) {
    await persistClientMoneyMutation(tx, {
      position: allocation.position,
      pool: allocation.pool,
      accountId: input.accountId,
      entryType: allocation.impact.lt(0) ? "trade_debit" : "trade_credit",
      impact: allocation.impact,
      actorId: input.actorId,
      orderId: input.orderId,
      tradeId: input.tradeId,
      notes: `Cash book impact from captured trade ${input.tradeId}`,
      negativeBalanceMessage: "Trade cash allocation would make a pooled balance negative.",
    });
  }
  await writeAudit(tx, {
    brokerId: input.brokerId, actorId: input.actorId, action: "CLIENT_MONEY_TRADE_BOOK_UPDATED",
    entityType: "trade", entityId: input.tradeId,
    summary: `${toNum(impact)} ETB mirrored to pooled-bank and beneficial-owner books`,
    newValue: { impact: toNum(impact), allocations: allocations.map((allocation) => ({ poolId: allocation.pool.id, amount: toNum(allocation.impact) })) },
  });
}

/** Move the external bank-confirmed side of prior trade-book allocations. */
export async function confirmClientMoneyTradeAtSettlement(
  tx: Prisma.TransactionClient,
  input: { brokerId: string; orderId: string; tradeId: string; actorId: string },
) {
  const tradeEntries = await tx.pooledBankLedgerEntry.findMany({
    where: { tradeId: input.tradeId, entryType: { in: ["trade_debit", "trade_credit"] } },
    orderBy: { pooledBankAccountId: "asc" },
  });
  // Pre-migration trades are represented by the signed-off opening position
  // and have no per-trade pool entry to replay. New trades always create one.
  if (!tradeEntries.length) {
    await writeAudit(tx, {
      brokerId: input.brokerId, actorId: input.actorId, action: "POOLED_BANK_SETTLEMENT_OPENING_BALANCE_USED",
      entityType: "trade", entityId: input.tradeId,
      summary: "Settlement used the signed-off opening client-money balance because this trade predates the pooled ledger",
    });
    return { poolIds: [] as string[] };
  }
  const byPool = new Map<string, Prisma.Decimal>();
  for (const entry of tradeEntries) byPool.set(entry.pooledBankAccountId, (byPool.get(entry.pooledBankAccountId) ?? ZERO).plus(entry.balanceImpact));
  for (const [poolId, impactRaw] of byPool) {
    await lockPool(tx, poolId);
    const pool = await tx.pooledBankAccount.findUniqueOrThrow({ where: { id: poolId } });
    await persistPooledStatementMutation(tx, {
      pool,
      entryType: "settlement_bank_confirmed",
      statementImpact: impactRaw,
      actorId: input.actorId,
      orderId: input.orderId,
      tradeId: input.tradeId,
      bankReference: `SETTLEMENT-${input.tradeId}`,
      notes: "External cash leg confirmed through the controlled settlement workflow",
      negativeBalanceMessage: "Settlement would make the confirmed pooled bank balance negative.",
    });
  }
  await writeAudit(tx, {
    brokerId: input.brokerId, actorId: input.actorId, action: "POOLED_BANK_SETTLEMENT_CONFIRMED",
    entityType: "trade", entityId: input.tradeId,
    summary: "Pooled bank statement side updated for the confirmed cash settlement leg",
    newValue: { pools: [...byPool].map(([poolId, impact]) => ({ poolId, impact: toNum(impact) })) },
  });
  return { poolIds: [...byPool.keys()] };
}
