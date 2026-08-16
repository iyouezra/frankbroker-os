import { Prisma } from "../../app/generated/prisma/client";
import { addisDateOnly, addisYear } from "../addis-date";
import { money, toNum, ZERO } from "../money";
import { writeAudit } from "../oms/audit-service";
import {
  assertBalanced,
  idempotencyKeyFor,
  JournalBalanceError,
  pruneZeroLines,
  reverseLines,
  signedAmount,
  type DraftEntry,
} from "./journal-rules";

/**
 * The one place journal entries are written.
 *
 * This mirrors `persistCashMutation` in `lib/oms/persistence.ts` deliberately:
 * it takes an already-open transaction, never opens its own, and expects the
 * caller to supply the actor and value date. A posting therefore commits or
 * rolls back with the sub-ledger movement that caused it — the two can never
 * disagree about whether an event happened.
 *
 * Lock ordering across the platform is:
 *
 *   orders -> accounts -> holdings -> pooled_bank_accounts
 *          -> client_money_positions -> ledger_accounts
 *
 * Ledger accounts come last because every entry touches a handful of them, so
 * holding them for the shortest possible window matters most. Within this
 * function they are locked in role order, never code order, because a broker
 * may renumber their codes at any time and a mutable lock order is a deadlock
 * waiting to happen.
 */

function journalEntryId() {
  return `JRN-${addisYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function lockLedgerAccounts(tx: Prisma.TransactionClient, ids: string[]) {
  if (!ids.length) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "ledger_accounts" WHERE "id" = ANY(${ids}) ORDER BY "role" FOR UPDATE`,
  );
}

export type PostJournalEntryInput = {
  brokerId: string;
  actorId: string | null;
  draft: DraftEntry;
  reason?: string | null;
  entryDate?: Date;
  /** Required only for the manual correction and opening balance paths. */
  approverId?: string | null;
  orderId?: string | null;
  tradeId?: string | null;
  settlementId?: string | null;
  cashMovementId?: string | null;
  accountId?: string | null;
};

export async function postJournalEntry(
  tx: Prisma.TransactionClient,
  input: PostJournalEntryInput,
): Promise<{ entryId: string; idempotent: boolean }> {
  const lines = pruneZeroLines(input.draft.lines);
  const idempotencyKey = idempotencyKeyFor(input.draft);

  // Replaying an event is a no-op. Same shape as the capture-reference
  // short-circuit in trade-service.
  const existing = await tx.journalEntry.findUnique({
    where: { brokerId_idempotencyKey: { brokerId: input.brokerId, idempotencyKey } },
    select: { id: true },
  });
  if (existing) return { entryId: existing.id, idempotent: true };

  const roles = [...new Set(lines.map((line) => line.role))];
  const accounts = await tx.ledgerAccount.findMany({
    where: { brokerId: input.brokerId, role: { in: roles } },
  });
  const byRole = new Map(accounts.map((account) => [account.role, account]));
  const missing = roles.filter((role) => !byRole.has(role));
  if (missing.length) {
    throw new JournalBalanceError(
      `Chart of accounts is missing ${missing.join(", ")} for this broker. Seed the chart before posting.`,
    );
  }
  const postableRoles = new Set(accounts.filter((account) => account.postingEnabled && account.status === "active").map((account) => account.role));

  // Structure first, then tenant state: an unbalanced entry is a bug, a
  // disabled role is a configuration problem, and the messages differ.
  const { totalDebit, totalCredit } = assertBalanced(lines, { postableRoles });

  await lockLedgerAccounts(tx, accounts.map((account) => account.id));
  const locked = await tx.ledgerAccount.findMany({
    where: { id: { in: accounts.map((account) => account.id) } },
  });
  const balances = new Map(locked.map((account) => [account.role, {
    id: account.id,
    balance: money(account.balance),
    debitTotal: money(account.debitTotal),
    creditTotal: money(account.creditTotal),
  }]));

  const entryId = journalEntryId();
  await tx.journalEntry.create({
    data: {
      id: entryId,
      brokerId: input.brokerId,
      entryDate: input.entryDate ?? addisDateOnly(),
      valueDate: input.draft.valueDate,
      sourceType: input.draft.sourceType,
      sourceId: input.draft.sourceId,
      idempotencyKey,
      description: input.draft.description,
      status: input.draft.sourceType === "reversal" ? "reversal" : "posted",
      totalDebit,
      totalCredit,
      reason: input.reason ?? null,
      postedBy: input.actorId,
      approvedBy: input.approverId ?? null,
      approvedAt: input.approverId ? new Date() : null,
      orderId: input.orderId ?? null,
      tradeId: input.tradeId ?? null,
      settlementId: input.settlementId ?? null,
      cashMovementId: input.cashMovementId ?? null,
      accountId: input.accountId ?? null,
    },
  });

  const lineRows = lines.map((line, index) => {
    const account = balances.get(line.role);
    if (!account) throw new JournalBalanceError(`Ledger role "${line.role}" disappeared between lookup and posting.`);
    const amount = money(line.amount);
    account.balance = money(account.balance.plus(signedAmount(line)));
    if (line.side === "debit") account.debitTotal = money(account.debitTotal.plus(amount));
    else account.creditTotal = money(account.creditTotal.plus(amount));
    return {
      id: crypto.randomUUID(),
      entryId,
      brokerId: input.brokerId,
      ledgerAccountId: account.id,
      lineNumber: index + 1,
      side: line.side,
      amount,
      runningBalance: account.balance,
      memo: line.memo,
      clientAccountId: line.clientAccountId ?? null,
      pooledBankAccountId: line.pooledBankAccountId ?? null,
      instrumentId: line.instrumentId ?? null,
      valueDate: input.draft.valueDate,
    };
  });
  await tx.journalLine.createMany({ data: lineRows });

  for (const account of balances.values()) {
    await tx.ledgerAccount.update({
      where: { id: account.id },
      data: {
        balance: account.balance,
        debitTotal: account.debitTotal,
        creditTotal: account.creditTotal,
        version: { increment: 1 },
      },
    });
  }

  await writeAudit(tx, {
    brokerId: input.brokerId,
    actorId: input.actorId,
    action: "JOURNAL_ENTRY_POSTED",
    entityType: "journal_entry",
    entityId: entryId,
    summary: `${input.draft.description} (${totalDebit.toFixed(2)} ETB)`,
    newValue: {
      idempotencyKey,
      sourceType: input.draft.sourceType,
      sourceId: input.draft.sourceId,
      totalDebit: toNum(totalDebit),
      totalCredit: toNum(totalCredit),
      lines: lineRows.map((line) => ({ role: lines[line.lineNumber - 1].role, side: line.side, amount: toNum(line.amount) })),
    },
    reason: input.reason ?? null,
  });

  return { entryId, idempotent: false };
}

/**
 * Correct a posted entry by mirroring it. Editing is impossible by design —
 * database triggers reject any update to a line — so this is the only way a
 * mistake is undone, and it leaves both the error and the correction on the
 * record.
 */
export async function reverseJournalEntry(
  tx: Prisma.TransactionClient,
  input: { brokerId: string; entryId: string; actorId: string; approverId: string; reason: string },
): Promise<{ reversalEntryId: string }> {
  const reason = input.reason.trim();
  if (!reason) throw new JournalBalanceError("A reversal must record why it was made.");

  const original = await tx.journalEntry.findFirst({
    where: { id: input.entryId, brokerId: input.brokerId },
    include: { lines: { include: { ledgerAccount: true }, orderBy: { lineNumber: "asc" } } },
  });
  if (!original) throw new JournalBalanceError("That journal entry does not belong to this broker.");
  if (original.status === "reversed") throw new JournalBalanceError("That journal entry has already been reversed.");

  const settings = await tx.brokerSettings.findUnique({ where: { brokerId: input.brokerId }, select: { makerChecker: true } });
  if (settings?.makerChecker !== false && input.approverId === input.actorId) {
    throw new JournalBalanceError("Maker-checker control requires another user to approve a ledger reversal.");
  }

  const draft: DraftEntry = {
    sourceType: "reversal",
    sourceId: original.id,
    eventKey: "reversal",
    description: `Reversal of ${original.id}`,
    valueDate: original.valueDate,
    lines: reverseLines(original.lines.map((line) => ({
      role: line.ledgerAccount.role as DraftEntry["lines"][number]["role"],
      side: line.side as "debit" | "credit",
      amount: line.amount,
      memo: `Reversal: ${line.memo}`,
      clientAccountId: line.clientAccountId,
      pooledBankAccountId: line.pooledBankAccountId,
      instrumentId: line.instrumentId,
    }))),
  };

  const posted = await postJournalEntry(tx, {
    brokerId: input.brokerId,
    actorId: input.actorId,
    approverId: input.approverId,
    draft,
    reason,
    orderId: original.orderId,
    tradeId: original.tradeId,
    settlementId: original.settlementId,
    cashMovementId: original.cashMovementId,
    accountId: original.accountId,
  });

  await tx.journalEntry.update({
    where: { id: posted.entryId },
    data: { reversesEntryId: original.id, reversalReason: reason },
  });
  await tx.journalEntry.update({
    where: { id: original.id },
    data: { status: "reversed" },
  });

  await writeAudit(tx, {
    brokerId: input.brokerId,
    actorId: input.actorId,
    action: "JOURNAL_ENTRY_REVERSED",
    entityType: "journal_entry",
    entityId: original.id,
    summary: `Journal entry ${original.id} reversed by ${posted.entryId}`,
    previousValue: { status: original.status },
    newValue: { status: "reversed", reversalEntryId: posted.entryId },
    reason,
  });

  return { reversalEntryId: posted.entryId };
}

/**
 * Sum every posted line per account and compare it with the stored balance.
 * Storing balances keeps the trial balance cheap; this is the check that keeps
 * storing them honest.
 */
export async function computeStoredBalanceDrift(tx: Prisma.TransactionClient, brokerId: string) {
  const accounts = await tx.ledgerAccount.findMany({ where: { brokerId }, orderBy: { role: "asc" } });
  const drift: Array<{ role: string; stored: Prisma.Decimal; recomputed: Prisma.Decimal; variance: Prisma.Decimal }> = [];
  for (const account of accounts) {
    const lines = await tx.journalLine.findMany({
      where: { ledgerAccountId: account.id },
      select: { side: true, amount: true },
    });
    const recomputed = lines.reduce(
      (total, line) => (line.side === "debit" ? money(total.plus(line.amount)) : money(total.minus(line.amount))),
      ZERO,
    );
    const variance = money(money(account.balance).minus(recomputed));
    if (!variance.isZero()) drift.push({ role: account.role, stored: money(account.balance), recomputed, variance });
  }
  return drift;
}
