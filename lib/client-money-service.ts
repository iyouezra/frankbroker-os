import { Prisma } from "../app/generated/prisma/client";
import { money, toNum, ZERO } from "./money";
import { writeAudit } from "./oms/audit-service";

const fail = (message: string, status = 409) => Response.json({ error: message }, { status });

async function lockPool(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "pooled_bank_accounts" WHERE "id" = ${id} FOR UPDATE`);
}

async function lockPosition(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "client_money_positions" WHERE "id" = ${id} FOR UPDATE`);
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
    const nextPosition = money(allocation.position.balance.plus(allocation.impact));
    const nextPool = money(allocation.pool.bookBalance.plus(allocation.impact));
    if (nextPosition.lt(0) || nextPool.lt(0)) throw fail("Trade cash allocation would make a pooled balance negative.");
    await tx.clientMoneyPosition.update({ where: { id: allocation.position.id }, data: { balance: nextPosition, version: { increment: 1 } } });
    await tx.pooledBankAccount.update({ where: { id: allocation.pool.id }, data: { bookBalance: nextPool, version: { increment: 1 } } });
    const entryType = allocation.impact.lt(0) ? "trade_debit" : "trade_credit";
    await tx.clientMoneyLedgerEntry.create({ data: {
      id: crypto.randomUUID(), positionId: allocation.position.id, accountId: input.accountId, pooledBankAccountId: allocation.pool.id,
      orderId: input.orderId, tradeId: input.tradeId, entryType, amount: allocation.impact,
      balanceImpact: allocation.impact, runningBalance: nextPosition, createdBy: input.actorId,
      notes: `Cash book impact from captured trade ${input.tradeId}`,
    } });
    await tx.pooledBankLedgerEntry.create({ data: {
      id: crypto.randomUUID(), pooledBankAccountId: allocation.pool.id, orderId: input.orderId, tradeId: input.tradeId,
      entryType, amount: allocation.impact, balanceImpact: allocation.impact, runningBalance: nextPool,
      createdBy: input.actorId, notes: `Cash book impact from captured trade ${input.tradeId}`,
    } });
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
    return;
  }
  const byPool = new Map<string, Prisma.Decimal>();
  for (const entry of tradeEntries) byPool.set(entry.pooledBankAccountId, (byPool.get(entry.pooledBankAccountId) ?? ZERO).plus(entry.balanceImpact));
  for (const [poolId, impactRaw] of byPool) {
    await lockPool(tx, poolId);
    const pool = await tx.pooledBankAccount.findUniqueOrThrow({ where: { id: poolId } });
    const impact = money(impactRaw);
    const nextStatement = money(pool.statementBalance.plus(impact));
    if (nextStatement.lt(0)) throw fail("Settlement would make the confirmed pooled bank balance negative.");
    await tx.pooledBankAccount.update({ where: { id: poolId }, data: { statementBalance: nextStatement, lastReconciledAt: new Date(), version: { increment: 1 } } });
    await tx.pooledBankLedgerEntry.create({ data: {
      id: crypto.randomUUID(), pooledBankAccountId: poolId, orderId: input.orderId, tradeId: input.tradeId,
      entryType: "settlement_bank_confirmed", amount: impact, balanceImpact: ZERO, runningBalance: pool.bookBalance,
      bankReference: `SETTLEMENT-${input.tradeId}`, createdBy: input.actorId,
      notes: "External cash leg confirmed through the controlled settlement workflow",
    } });
  }
  await writeAudit(tx, {
    brokerId: input.brokerId, actorId: input.actorId, action: "POOLED_BANK_SETTLEMENT_CONFIRMED",
    entityType: "trade", entityId: input.tradeId,
    summary: "Pooled bank statement side updated for the confirmed cash settlement leg",
    newValue: { pools: [...byPool].map(([poolId, impact]) => ({ poolId, impact: toNum(impact) })) },
  });
}
