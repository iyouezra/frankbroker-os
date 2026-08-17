/**
 * Read-only projections of the general ledger.
 *
 * Nothing here writes. The ledger is a consequence of operational events, so
 * the only way to change a balance is to change what happened — capture a
 * trade, verify a deposit, reverse an entry. That is why this module exposes
 * no mutation and the finance workspace has no create affordance.
 */
import type { Prisma, PrismaClient } from "../../app/generated/prisma/client";
import { D, ZERO, money, toNum } from "../money";
import { LEDGER_ROLES, type LedgerRole } from "./journal-rules";

type Db = PrismaClient | Prisma.TransactionClient;

export type TrialBalanceRow = {
  id: string;
  role: string;
  code: string;
  name: string;
  accountClass: string;
  normalBalance: string;
  statementCaption: string;
  subLedger: string | null;
  postingEnabled: boolean;
  /** Signed, debit-positive. */
  balance: number;
  /** Presentation split: a debit-normal account with a positive balance sits in the debit column. */
  debit: number;
  credit: number;
  debitTotal: number;
  creditTotal: number;
  entryCount: number;
};

export type TrialBalance = {
  asAt: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  /** Zero when the books balance. Anything else is a break, not a rounding artefact. */
  variance: number;
  balanced: boolean;
};

/**
 * Client money adequacy: does what we hold for clients cover what we owe them?
 * A negative surplus is a segregation deficit, which is a reportable breach in
 * most regimes and the single number a regulator asks for first.
 */
export type ClientMoneyAdequacy = {
  held: number;
  owed: number;
  surplus: number;
  adequate: boolean;
  components: Array<{ role: string; code: string; name: string; side: "held" | "owed"; amount: number }>;
};

const HELD_ROLES: LedgerRole[] = [
  LEDGER_ROLES.clientMoneyPooledBank,
  LEDGER_ROLES.clientMoneyGateway,
  LEDGER_ROLES.settlementReceivable,
];

const OWED_ROLES: LedgerRole[] = [
  LEDGER_ROLES.clientMoneyPayableSettled,
  LEDGER_ROLES.clientMoneyPayableUnsettled,
  LEDGER_ROLES.unidentifiedReceipts,
  LEDGER_ROLES.settlementPayable,
];

/**
 * As-at balances. When `asAt` is today we can read the stored balances; for any
 * earlier date we must sum the lines, because stored balances are current by
 * definition. Keeping both paths here means callers never have to know which.
 */
export async function buildTrialBalance(db: Db, brokerId: string, asAt?: Date): Promise<TrialBalance> {
  const accounts = await db.ledgerAccount.findMany({ where: { brokerId }, orderBy: { code: "asc" } });
  const historic = Boolean(asAt);
  const lineFilter: Prisma.JournalLineWhereInput = { brokerId, ...(asAt ? { valueDate: { lte: asAt } } : {}) };

  const grouped = await db.journalLine.groupBy({
    by: ["ledgerAccountId", "side"],
    where: lineFilter,
    _sum: { amount: true },
    _count: { _all: true },
  });

  const sums = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal; count: number }>();
  for (const row of grouped) {
    const current = sums.get(row.ledgerAccountId) ?? { debit: ZERO, credit: ZERO, count: 0 };
    const amount = row._sum.amount ?? ZERO;
    if (row.side === "debit") current.debit = money(current.debit.plus(amount));
    else current.credit = money(current.credit.plus(amount));
    current.count += row._count._all;
    sums.set(row.ledgerAccountId, current);
  }

  let totalDebit = ZERO;
  let totalCredit = ZERO;
  const rows: TrialBalanceRow[] = accounts.map((account) => {
    const sum = sums.get(account.id) ?? { debit: ZERO, credit: ZERO, count: 0 };
    const balance = historic ? money(sum.debit.minus(sum.credit)) : account.balance;
    totalDebit = money(totalDebit.plus(sum.debit));
    totalCredit = money(totalCredit.plus(sum.credit));
    return {
      id: account.id,
      role: account.role,
      code: account.code,
      name: account.name,
      accountClass: account.accountClass,
      normalBalance: account.normalBalance,
      statementCaption: account.statementCaption,
      subLedger: account.subLedger,
      postingEnabled: account.postingEnabled,
      balance: toNum(balance),
      debit: balance.gt(0) ? toNum(balance) : 0,
      credit: balance.lt(0) ? toNum(balance.negated()) : 0,
      debitTotal: toNum(historic ? sum.debit : account.debitTotal),
      creditTotal: toNum(historic ? sum.credit : account.creditTotal),
      entryCount: sum.count,
    };
  });

  const variance = money(totalDebit.minus(totalCredit));
  return {
    asAt: (asAt ?? new Date()).toISOString().slice(0, 10),
    rows,
    totalDebit: toNum(totalDebit),
    totalCredit: toNum(totalCredit),
    variance: toNum(variance),
    balanced: variance.isZero(),
  };
}

export function buildClientMoneyAdequacy(trialBalance: TrialBalance): ClientMoneyAdequacy {
  const components: ClientMoneyAdequacy["components"] = [];
  let held = ZERO;
  let owed = ZERO;

  for (const row of trialBalance.rows) {
    const isHeld = HELD_ROLES.includes(row.role as LedgerRole);
    const isOwed = OWED_ROLES.includes(row.role as LedgerRole);
    if (!isHeld && !isOwed) continue;
    // Assets carry a debit balance and liabilities a credit balance, so the
    // liability side arrives negative. Flip it so both read as magnitudes.
    const amount = isHeld ? D(row.balance) : D(row.balance).negated();
    if (isHeld) held = money(held.plus(amount));
    else owed = money(owed.plus(amount));
    components.push({ role: row.role, code: row.code, name: row.name, side: isHeld ? "held" : "owed", amount: toNum(amount) });
  }

  const surplus = money(held.minus(owed));
  return { held: toNum(held), owed: toNum(owed), surplus: toNum(surplus), adequate: surplus.gte(0), components };
}

export type LedgerLineRow = {
  id: string;
  entryId: string;
  lineNumber: number;
  side: string;
  amount: number;
  runningBalance: number;
  memo: string;
  valueDate: string;
  entryDate: string;
  description: string;
  sourceType: string;
  sourceId: string | null;
  status: string;
  clientAccountId: string | null;
  clientAccountNumber: string | null;
  clientName: string | null;
};

/** The lines that hit one control account, newest first — the drill-down target. */
export async function buildAccountStatement(db: Db, brokerId: string, accountId: string, limit = 100) {
  const account = await db.ledgerAccount.findFirst({ where: { id: accountId, brokerId } });
  if (!account) return null;
  const lines = await db.journalLine.findMany({
    where: { brokerId, ledgerAccountId: accountId },
    orderBy: [{ valueDate: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      entry: { select: { id: true, description: true, sourceType: true, sourceId: true, status: true, entryDate: true } },
      clientAccount: { select: { accountNumber: true, client: { select: { fullName: true } } } },
    },
  });
  return {
    account: {
      id: account.id,
      role: account.role,
      code: account.code,
      name: account.name,
      accountClass: account.accountClass,
      normalBalance: account.normalBalance,
      statementCaption: account.statementCaption,
      subLedger: account.subLedger,
      balance: toNum(account.balance),
      debitTotal: toNum(account.debitTotal),
      creditTotal: toNum(account.creditTotal),
    },
    lines: lines.map((line): LedgerLineRow => ({
      id: line.id,
      entryId: line.entryId,
      lineNumber: line.lineNumber,
      side: line.side,
      amount: toNum(line.amount),
      runningBalance: toNum(line.runningBalance),
      memo: line.memo,
      valueDate: line.valueDate.toISOString().slice(0, 10),
      entryDate: line.entry.entryDate.toISOString().slice(0, 10),
      description: line.entry.description,
      sourceType: line.entry.sourceType,
      sourceId: line.entry.sourceId,
      status: line.entry.status,
      clientAccountId: line.clientAccountId,
      clientAccountNumber: line.clientAccount?.accountNumber ?? null,
      clientName: line.clientAccount?.client.fullName ?? null,
    })),
  };
}

/**
 * One entry with every line. This is the end of the drill-through: from here
 * the reader jumps to the trade or cash movement that caused the posting,
 * which is the thing a hand-keyed voucher can never offer.
 */
export async function getJournalEntry(db: Db, brokerId: string, entryId: string) {
  const entry = await db.journalEntry.findFirst({
    where: { id: entryId, brokerId },
    include: {
      lines: { orderBy: { lineNumber: "asc" }, include: { ledgerAccount: { select: { code: true, name: true, role: true } }, clientAccount: { select: { accountNumber: true, client: { select: { fullName: true } } } } } },
      postedByUser: { select: { fullName: true } },
      approvedByUser: { select: { fullName: true } },
      reverses: { select: { id: true } },
      reversedBy: { select: { id: true } },
    },
  });
  if (!entry) return null;
  return {
    id: entry.id,
    entryDate: entry.entryDate.toISOString().slice(0, 10),
    valueDate: entry.valueDate.toISOString().slice(0, 10),
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    description: entry.description,
    status: entry.status,
    reason: entry.reason,
    totalDebit: toNum(entry.totalDebit),
    totalCredit: toNum(entry.totalCredit),
    postedBy: entry.postedByUser?.fullName ?? null,
    postedAt: entry.postedAt.toISOString(),
    approvedBy: entry.approvedByUser?.fullName ?? null,
    reversesEntryId: entry.reverses?.id ?? null,
    reversedByEntryId: entry.reversedBy?.id ?? null,
    orderId: entry.orderId,
    tradeId: entry.tradeId,
    settlementId: entry.settlementId,
    cashMovementId: entry.cashMovementId,
    lines: entry.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      side: line.side,
      amount: toNum(line.amount),
      memo: line.memo,
      code: line.ledgerAccount.code,
      name: line.ledgerAccount.name,
      role: line.ledgerAccount.role,
      ledgerAccountId: line.ledgerAccountId,
      clientAccountNumber: line.clientAccount?.accountNumber ?? null,
      clientName: line.clientAccount?.client.fullName ?? null,
    })),
  };
}

/** Recent entries, newest first, optionally narrowed by source type. */
export async function listJournalEntries(db: Db, brokerId: string, options: { limit?: number; sourceType?: string } = {}) {
  const entries = await db.journalEntry.findMany({
    where: { brokerId, ...(options.sourceType ? { sourceType: options.sourceType } : {}) },
    orderBy: [{ valueDate: "desc" }, { postedAt: "desc" }],
    take: options.limit ?? 50,
    include: { lines: { select: { id: true } } },
  });
  return entries.map((entry) => ({
    id: entry.id,
    entryDate: entry.entryDate.toISOString().slice(0, 10),
    valueDate: entry.valueDate.toISOString().slice(0, 10),
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    description: entry.description,
    status: entry.status,
    totalDebit: toNum(entry.totalDebit),
    totalCredit: toNum(entry.totalCredit),
    lineCount: entry.lines.length,
    tradeId: entry.tradeId,
    cashMovementId: entry.cashMovementId,
    orderId: entry.orderId,
  }));
}

/**
 * Does the ledger agree with the sub-ledgers it claims to summarise? Each tie
 * compares one control account against the operational records that produced
 * it. A break here means the projection has drifted from reality, and reality
 * wins — the sub-ledger is the system of record.
 */
export type LedgerTie = {
  key: string;
  label: string;
  detail: string;
  glBalance: number;
  subLedgerBalance: number;
  variance: number;
  matched: boolean;
};

export async function buildLedgerTies(db: Db, brokerId: string): Promise<LedgerTie[]> {
  const accounts = await db.ledgerAccount.findMany({ where: { brokerId } });
  const balanceOf = (role: LedgerRole) => {
    const account = accounts.find((item) => item.role === role);
    return account ? account.balance : ZERO;
  };

  const [pools, accountTotals] = await Promise.all([
    db.pooledBankAccount.aggregate({ where: { brokerId }, _sum: { statementBalance: true } }),
    db.account.aggregate({ where: { client: { brokerId } }, _sum: { availableCash: true, blockedCash: true, unsettledCash: true } }),
  ]);

  const pooled = pools._sum.statementBalance ?? ZERO;
  const settled = money((accountTotals._sum.availableCash ?? ZERO).plus(accountTotals._sum.blockedCash ?? ZERO));
  const unsettled = accountTotals._sum.unsettledCash ?? ZERO;

  const tie = (key: string, label: string, detail: string, gl: Prisma.Decimal, sub: Prisma.Decimal): LedgerTie => {
    const variance = money(gl.minus(sub));
    return { key, label, detail, glBalance: toNum(gl), subLedgerBalance: toNum(sub), variance: toNum(variance), matched: variance.isZero() };
  };

  return [
    tie("pooled_bank", "Client bank vs ledger", "Confirmed bank statement balance across every pooled account", balanceOf(LEDGER_ROLES.clientMoneyPooledBank), pooled),
    // Liabilities carry credit balances, so negate to compare against the
    // positive cash figures the sub-ledger reports.
    tie("client_settled", "Client settled cash vs ledger", "Available plus blocked cash across every client account", balanceOf(LEDGER_ROLES.clientMoneyPayableSettled).negated(), settled),
    tie("client_unsettled", "Client unsettled cash vs ledger", "Sale proceeds not yet received from the CSD", balanceOf(LEDGER_ROLES.clientMoneyPayableUnsettled).negated(), unsettled),
  ];
}
