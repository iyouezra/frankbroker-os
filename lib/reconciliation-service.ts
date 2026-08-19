import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../app/generated/prisma/client";
import { addisDateOnly } from "./addis-date";
import { buildLedgerTies, buildTrialBalance } from "./gl/ledger-reporting";
import { D, ZERO } from "./money";
import { writeAudit } from "./oms/audit-service";

type Db = PrismaClient | Prisma.TransactionClient;

export const RECONCILIATION_FEEDS = [
  "esx_executions",
  "csd_positions",
  "bank_balances",
  "fees_settlement",
  "client_money",
  "general_ledger",
] as const;

export type ReconciliationFeed = (typeof RECONCILIATION_FEEDS)[number];

export const REQUIRED_EOD_FEEDS: ReconciliationFeed[] = [
  "esx_executions",
  "csd_positions",
  "bank_balances",
  "fees_settlement",
];

export const FEED_LABELS: Record<ReconciliationFeed, string> = {
  esx_executions: "ESX executions",
  csd_positions: "CSD positions",
  bank_balances: "Bank balances",
  fees_settlement: "Fees & settlement obligations",
  client_money: "Client-money subledger",
  general_ledger: "General ledger",
};

const FEED_RECORD_TYPES: Record<ReconciliationFeed, string[]> = {
  esx_executions: ["cash", "securities", "fee"],
  csd_positions: ["csd_position"],
  bank_balances: ["bank_balance"],
  fees_settlement: ["fee", "settlement_obligation"],
  client_money: ["client_money"],
  general_ledger: ["general_ledger"],
};

export type ReconciliationInputRow = {
  reference: string;
  type: string;
  actualValue: string;
};

type BatchResult = {
  id: string;
  matchedRecords: number;
  totalRecords: number;
  exceptionRecords: number;
};

export type EodCheck = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
  blocking: boolean;
};

export function serializeReconciliationBatch(batch: {
  id: string;
  batchDate: Date;
  fileName: string | null;
  source: string;
  feedType: string;
  contentHash: string | null;
  attemptNumber: number;
  supersedesBatchId: string | null;
  totalRecords: number;
  matchedRecords: number;
  exceptionRecords: number;
  status: string;
  reviewedAt: Date | null;
  evidenceReference: string | null;
  reviewedByUser?: { fullName: string } | null;
  exceptions: Array<{ id: string; reference: string; exceptionType: string; expectedValue: string | null; actualValue: string | null; status: string; resolutionNotes: string | null }>;
}) {
  return {
    id: batch.id,
    batchDate: batch.batchDate.toISOString().slice(0, 10),
    fileName: batch.fileName,
    source: batch.source,
    feedType: batch.feedType,
    contentHash: batch.contentHash,
    attemptNumber: batch.attemptNumber,
    supersedesBatchId: batch.supersedesBatchId,
    totalRecords: batch.totalRecords,
    matchedRecords: batch.matchedRecords,
    exceptionRecords: batch.exceptionRecords,
    status: batch.status,
    reviewedAt: batch.reviewedAt?.toISOString() ?? null,
    reviewedBy: batch.reviewedByUser?.fullName ?? null,
    evidenceReference: batch.evidenceReference,
    exceptions: batch.exceptions,
  };
}

export function reconciliationFeed(value: unknown): ReconciliationFeed {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!RECONCILIATION_FEEDS.includes(normalized as ReconciliationFeed)) {
    throw new Response("Select a supported reconciliation feed.", { status: 400 });
  }
  return normalized as ReconciliationFeed;
}

export function normalizeReconciliationRows(feed: ReconciliationFeed, input: unknown): ReconciliationInputRow[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Response("Upload a CSV containing reference, type, and actual_value columns.", { status: 400 });
  }
  if (input.length > 50_000) throw new Response("A reconciliation file cannot exceed 50,000 rows.", { status: 400 });

  const allowed = new Set(FEED_RECORD_TYPES[feed]);
  const seen = new Set<string>();
  return input.map((value, index) => {
    const row = value as { reference?: unknown; type?: unknown; actualValue?: unknown };
    const reference = String(row.reference ?? "").trim();
    const type = String(row.type ?? "").trim().toLowerCase();
    const actualValue = String(row.actualValue ?? "").trim();
    if (!reference || reference.length > 160) throw new Response(`Row ${index + 2} has an invalid reference.`, { status: 400 });
    if (!allowed.has(type)) throw new Response(`Row ${index + 2} uses type "${type}" which is not valid for ${FEED_LABELS[feed]}.`, { status: 400 });
    try {
      D(actualValue);
    } catch {
      throw new Response(`Row ${index + 2} has an invalid actual_value.`, { status: 400 });
    }
    const key = `${type}\u0000${reference}`;
    if (seen.has(key)) throw new Response(`Duplicate source row for ${type} / ${reference}.`, { status: 400 });
    seen.add(key);
    return { reference, type, actualValue: D(actualValue).toFixed() };
  });
}

export function reconciliationContentHash(feed: ReconciliationFeed, businessDate: Date, rows: ReconciliationInputRow[]) {
  const canonical = [...rows]
    .sort((left, right) => `${left.type}\u0000${left.reference}`.localeCompare(`${right.type}\u0000${right.reference}`))
    .map((row) => `${row.type}\u0000${row.reference}\u0000${D(row.actualValue).toFixed()}`)
    .join("\n");
  return createHash("sha256").update(`${feed}\n${businessDate.toISOString().slice(0, 10)}\n${canonical}`).digest("hex");
}

export async function assertBusinessDayOpen(db: Db, brokerId: string, businessDate = addisDateOnly()) {
  const control = await db.businessDayControl.findUnique({
    where: { brokerId_businessDate: { brokerId, businessDate } },
    select: { status: true },
  });
  if (control?.status === "closed") {
    throw new Response("This business day is closed. An authorized broker administrator must reopen it before financial activity can continue.", { status: 409 });
  }
}

const positionReference = (value: string) => {
  const [accountNumber, symbol, ...rest] = value.split(/[|:]/).map((part) => part.trim());
  return accountNumber && symbol && rest.length === 0 ? { accountNumber, symbol } : null;
};

async function expectedValues(db: Db, brokerId: string, rows: ReconciliationInputRow[]) {
  const tradeIds = [...new Set(rows.filter((row) => ["cash", "securities", "fee", "settlement_obligation"].includes(row.type)).map((row) => row.reference))];
  const poolRefs = [...new Set(rows.filter((row) => ["bank_balance", "client_money"].includes(row.type)).map((row) => row.reference))];
  const ledgerRefs = [...new Set(rows.filter((row) => row.type === "general_ledger").map((row) => row.reference))];
  const positionRefs = rows.filter((row) => row.type === "csd_position").map((row) => positionReference(row.reference)).filter((row): row is { accountNumber: string; symbol: string } => Boolean(row));

  const [trades, pools, ledgerAccounts, holdings] = await Promise.all([
    tradeIds.length ? db.trade.findMany({ where: { id: { in: tradeIds }, order: { brokerId } } }) : [],
    poolRefs.length ? db.pooledBankAccount.findMany({
      where: { brokerId, OR: [{ id: { in: poolRefs } }, { accountNumberMasked: { in: poolRefs } }] },
      include: { positions: { select: { balance: true } } },
    }) : [],
    ledgerRefs.length ? db.ledgerAccount.findMany({
      where: { brokerId, OR: [{ role: { in: ledgerRefs } }, { code: { in: ledgerRefs } }] },
    }) : [],
    positionRefs.length ? db.holding.findMany({
      where: {
        account: { client: { brokerId }, accountNumber: { in: positionRefs.map((item) => item.accountNumber) } },
        instrument: { symbol: { in: positionRefs.map((item) => item.symbol) } },
      },
      include: { account: { select: { accountNumber: true } }, instrument: { select: { symbol: true } } },
    }) : [],
  ]);

  const expected = new Map<string, Prisma.Decimal>();
  for (const trade of trades) {
    expected.set(`cash\u0000${trade.id}`, trade.netAmount);
    expected.set(`securities\u0000${trade.id}`, trade.quantityFilled);
    expected.set(`fee\u0000${trade.id}`, trade.fees);
    expected.set(`settlement_obligation\u0000${trade.id}`, trade.netAmount);
  }
  for (const pool of pools) {
    expected.set(`bank_balance\u0000${pool.id}`, pool.bookBalance);
    expected.set(`bank_balance\u0000${pool.accountNumberMasked}`, pool.bookBalance);
    const beneficial = pool.positions.reduce((sum, position) => sum.plus(position.balance), ZERO);
    expected.set(`client_money\u0000${pool.id}`, beneficial);
    expected.set(`client_money\u0000${pool.accountNumberMasked}`, beneficial);
  }
  for (const account of ledgerAccounts) {
    expected.set(`general_ledger\u0000${account.role}`, account.balance);
    expected.set(`general_ledger\u0000${account.code}`, account.balance);
  }
  for (const holding of holdings) {
    expected.set(`csd_position\u0000${holding.account.accountNumber}|${holding.instrument.symbol}`, holding.totalQuantity);
    expected.set(`csd_position\u0000${holding.account.accountNumber}:${holding.instrument.symbol}`, holding.totalQuantity);
  }
  return expected;
}

export async function processReconciliationBatch(input: {
  db: PrismaClient;
  brokerId: string;
  actorId: string;
  fileName: string;
  feedType: ReconciliationFeed;
  rows: ReconciliationInputRow[];
  businessDate?: Date;
  supersedesBatchId?: string;
  attemptNumber?: number;
  reprocessReason?: string;
}): Promise<BatchResult> {
  const businessDate = input.businessDate ?? addisDateOnly();
  await assertBusinessDayOpen(input.db, input.brokerId, businessDate);

  const contentHash = reconciliationContentHash(input.feedType, businessDate, input.rows);
  const attemptNumber = input.attemptNumber ?? 1;
  if (!input.supersedesBatchId) {
    const duplicate = await input.db.reconciliationBatch.findFirst({
      where: { brokerId: input.brokerId, batchDate: businessDate, feedType: input.feedType, contentHash, status: { not: "superseded" } },
      select: { id: true },
    });
    if (duplicate) throw new Response(`This file content was already imported as ${duplicate.id}. Use controlled reprocessing after correcting the internal book.`, { status: 409 });
  }

  const expected = await expectedValues(input.db, input.brokerId, input.rows);
  const exceptions: Array<{ id: string; reference: string; exceptionType: string; expectedValue: string | null; actualValue: string }> = [];
  let expectedTotal = ZERO;
  let actualTotal = ZERO;
  for (const row of input.rows) {
    const key = `${row.type}\u0000${row.reference}`;
    const expectedValue = expected.get(key);
    const actual = D(row.actualValue);
    actualTotal = actualTotal.plus(actual);
    if (!expectedValue) {
      exceptions.push({ id: crypto.randomUUID(), reference: row.reference, exceptionType: "missing_internal_reference", expectedValue: null, actualValue: actual.toFixed() });
      continue;
    }
    expectedTotal = expectedTotal.plus(expectedValue);
    if (!actual.equals(expectedValue)) {
      exceptions.push({
        id: crypto.randomUUID(),
        reference: row.reference,
        exceptionType: `${row.type}_variance`,
        expectedValue: expectedValue.toFixed(),
        actualValue: actual.toFixed(),
      });
    }
  }

  const id = `REC-${businessDate.getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const matchedRecords = input.rows.length - exceptions.length;
  return input.db.$transaction(async (tx) => {
    if (input.supersedesBatchId) {
      const prior = await tx.reconciliationBatch.findFirst({ where: { id: input.supersedesBatchId, brokerId: input.brokerId } });
      if (!prior) throw new Response("The reconciliation batch to reprocess was not found.", { status: 404 });
      const laterAttempt = await tx.reconciliationBatch.findUnique({ where: { supersedesBatchId: prior.id }, select: { id: true } });
      if (prior.status === "superseded" || laterAttempt) throw new Response("This reconciliation batch has already been superseded.", { status: 409 });
      await tx.reconciliationBatch.update({ where: { id: prior.id }, data: { status: "superseded" } });
    }
    const created = await tx.reconciliationBatch.create({
      data: {
        id,
        brokerId: input.brokerId,
        batchDate: businessDate,
        fileName: input.fileName,
        source: input.supersedesBatchId ? "controlled_reprocess" : "manual_upload",
        feedType: input.feedType,
        contentHash,
        inputRows: input.rows as unknown as Prisma.InputJsonValue,
        controlTotals: { expected: expectedTotal.toFixed(), actual: actualTotal.toFixed() },
        attemptNumber,
        supersedesBatchId: input.supersedesBatchId,
        totalRecords: input.rows.length,
        matchedRecords,
        exceptionRecords: exceptions.length,
        status: exceptions.length ? "exceptions" : "matched",
        uploadedBy: input.actorId,
        exceptions: { create: exceptions },
      },
    });
    await writeAudit(tx, {
      brokerId: input.brokerId,
      actorId: input.actorId,
      action: input.supersedesBatchId ? "RECONCILIATION_REPROCESSED" : "RECONCILIATION_IMPORTED",
      entityType: "reconciliation_batch",
      entityId: id,
      summary: `${FEED_LABELS[input.feedType]}: ${matchedRecords}/${input.rows.length} records matched`,
      reason: input.reprocessReason,
      newValue: { feedType: input.feedType, contentHash, attemptNumber, supersedesBatchId: input.supersedesBatchId ?? null, totalRecords: input.rows.length, matchedRecords, exceptionRecords: exceptions.length },
    });
    return created;
  });
}

export async function getEndOfDayReadiness(db: PrismaClient, brokerId: string, businessDate = addisDateOnly()) {
  const [control, batches, trialBalance, ledgerTies, pools, pendingSettlements, pendingCash] = await Promise.all([
    db.businessDayControl.findUnique({
      where: { brokerId_businessDate: { brokerId, businessDate } },
      include: { closedByUser: { select: { fullName: true } }, reopenedByUser: { select: { fullName: true } } },
    }),
    db.reconciliationBatch.findMany({ where: { brokerId, batchDate: businessDate, status: { not: "superseded" } }, include: { exceptions: true } }),
    buildTrialBalance(db, brokerId, businessDate),
    buildLedgerTies(db, brokerId),
    db.pooledBankAccount.findMany({ where: { brokerId, status: "active" }, include: { positions: { select: { balance: true } } } }),
    db.settlement.count({ where: { settlementDate: { lte: businessDate }, status: { not: "settled" }, trade: { order: { brokerId } } } }),
    db.cashMovement.count({ where: { brokerId, status: { in: ["submitted", "pending_review", "approved", "processing", "verified"] }, submittedAt: { lte: new Date(`${businessDate.toISOString().slice(0, 10)}T23:59:59.999Z`) } } }),
  ]);

  const signedFeeds = new Set(batches.filter((batch) => batch.status === "signed_off").map((batch) => batch.feedType));
  const missingFeeds = REQUIRED_EOD_FEEDS.filter((feed) => !signedFeeds.has(feed));
  const unresolved = batches.reduce((count, batch) => count + batch.exceptions.filter((item) => item.status !== "resolved").length, 0);
  const unsigned = batches.filter((batch) => batch.status !== "signed_off").length;
  const ownershipBreaks = pools.filter((pool) => !pool.positions.reduce((sum, item) => sum.plus(item.balance), ZERO).equals(pool.bookBalance));
  const brokenLedgerTies = ledgerTies.filter((tie) => !tie.matched);

  const checks: EodCheck[] = [
    { key: "required_feeds", label: "Required external feeds", passed: missingFeeds.length === 0, blocking: true, detail: missingFeeds.length ? `Missing signed-off feeds: ${missingFeeds.map((feed) => FEED_LABELS[feed]).join(", ")}` : "ESX, CSD, bank, fee and settlement evidence signed off" },
    { key: "reconciliation", label: "Reconciliation batches", passed: unresolved === 0 && unsigned === 0, blocking: true, detail: unresolved ? `${unresolved} unresolved exception${unresolved === 1 ? "" : "s"}` : unsigned ? `${unsigned} batch${unsigned === 1 ? "" : "es"} awaiting independent sign-off` : "All active batches resolved and signed off" },
    { key: "client_money", label: "Client-money ownership", passed: ownershipBreaks.length === 0, blocking: true, detail: ownershipBreaks.length ? `${ownershipBreaks.length} pooled account${ownershipBreaks.length === 1 ? "" : "s"} differ from beneficial-owner allocations` : "Pooled bank books agree with beneficial-owner allocations" },
    { key: "trial_balance", label: "General ledger", passed: trialBalance.balanced, blocking: true, detail: trialBalance.balanced ? "Trial balance debits and credits agree" : `Trial balance variance ${trialBalance.variance}` },
    { key: "ledger_ties", label: "GL control accounts", passed: brokenLedgerTies.length === 0, blocking: true, detail: brokenLedgerTies.length ? `${brokenLedgerTies.length} control account${brokenLedgerTies.length === 1 ? "" : "s"} do not tie to subledgers` : "Bank and client-cash control accounts tie to subledgers" },
    { key: "settlement", label: "Due settlements", passed: pendingSettlements === 0, blocking: true, detail: pendingSettlements ? `${pendingSettlements} due settlement${pendingSettlements === 1 ? " is" : "s are"} incomplete` : "No due settlements remain incomplete" },
    { key: "cash", label: "Client-money instructions", passed: pendingCash === 0, blocking: true, detail: pendingCash ? `${pendingCash} cash instruction${pendingCash === 1 ? " is" : "s are"} still in flight` : "No in-flight cash instructions at cut-off" },
  ];

  return {
    businessDate: businessDate.toISOString().slice(0, 10),
    status: control?.status ?? "open",
    cutoffAt: control?.cutoffAt?.toISOString() ?? null,
    closeEvidence: control?.closeEvidence ?? null,
    closedAt: control?.closedAt?.toISOString() ?? null,
    closedBy: control?.closedByUser?.fullName ?? null,
    reopenedAt: control?.reopenedAt?.toISOString() ?? null,
    reopenedBy: control?.reopenedByUser?.fullName ?? null,
    reopenReason: control?.reopenReason ?? null,
    version: control?.version ?? 0,
    ready: checks.every((check) => !check.blocking || check.passed),
    checks,
  };
}
