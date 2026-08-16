import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const rules = await read("../lib/gl/journal-rules.ts");
const posting = await read("../lib/gl/posting-service.ts");
const chartSeed = await read("../lib/gl/chart-seed.ts");
const schema = await read("../prisma/schema.prisma");
const migration = await read("../prisma/migrations/20260816120000_brokerage_general_ledger/migration.sql");
const tradeService = await read("../lib/oms/trade-service.ts");
const settlementService = await read("../lib/oms/settlement-service.ts");
const cashService = await read("../lib/cash-service.ts");
const orderService = await read("../lib/oms/order-service.ts");
const clientMoneyService = await read("../lib/client-money-service.ts");
const seed = await read("../prisma/seed.ts");

test("the posting rules module stays pure", () => {
  // Keeping the event-to-lines translation free of the database is what lets it
  // be tested with plain Decimal literals, exactly as the sub-ledger arithmetic
  // in lib/oms/ledger-service.ts is.
  assert.doesNotMatch(rules, /prisma|PrismaClient|\$transaction|findMany|findUnique/);
});

test("posting is a single choke point that never opens its own transaction", () => {
  assert.match(posting, /export async function postJournalEntry/);
  assert.match(posting, /tx: Prisma\.TransactionClient/);
  assert.doesNotMatch(posting, /prisma\.\$transaction/);
  // Accounting is plumbing. It must never generate user-facing noise.
  assert.doesNotMatch(posting, /writeNotification/);
  assert.match(posting, /JOURNAL_ENTRY_POSTED/);
  assert.match(posting, /JOURNAL_ENTRY_REVERSED/);
});

test("ledger accounts are locked deterministically by role, not by mutable code", () => {
  assert.match(posting, /FOR UPDATE/);
  // Codes belong to the broker and may be renumbered at any time, so ordering
  // locks by code would be a deadlock waiting to happen.
  assert.match(posting, /ORDER BY "role"/);
  assert.doesNotMatch(posting, /ORDER BY "code"/);
});

test("replaying an event is a no-op rather than a double posting", () => {
  assert.match(posting, /brokerId_idempotencyKey/);
  assert.match(posting, /idempotent: true/);
  assert.match(schema, /@@unique\(\[brokerId, idempotencyKey\]\)/);
});

test("corrections are made by reversal, never by edit, and need a second pair of eyes", () => {
  assert.match(posting, /export async function reverseJournalEntry/);
  assert.match(posting, /already been reversed/);
  assert.match(posting, /Maker-checker control requires another user/);
  assert.match(posting, /A reversal must record why it was made/);
});

test("append-only is enforced by the database, not only by convention", () => {
  assert.match(migration, /CREATE TRIGGER journal_lines_append_only/);
  assert.match(migration, /CREATE TRIGGER journal_entries_append_only/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "journal_lines"/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "journal_entries"/);
  assert.match(migration, /RAISE EXCEPTION/);
  assert.match(migration, /post a reversing entry instead/);
});

test("the general ledger posts from trade capture, after the sub-ledgers", () => {
  assert.match(tradeService, /postJournalEntry\(tx,/);
  assert.match(tradeService, /buyFillCaptured/);
  assert.match(tradeService, /sellFillCaptured/);
  // Compare call sites, not the imports at the top of the file. The entry
  // references the trade row, so the trade must exist first; and the
  // sub-ledgers move before the ledger that aggregates them.
  const postCall = tradeService.indexOf("postJournalEntry(tx,");
  assert.ok(postCall > tradeService.indexOf("tx.trade.create"), "ledger must post after the trade row exists");
  assert.ok(postCall > tradeService.indexOf("applyClientMoneyTradeBook(tx,"), "ledger must post after the client-money books move");
});

test("the general ledger posts from settlement confirmation", () => {
  assert.match(settlementService, /postJournalEntry\(tx,/);
  assert.match(settlementService, /buySettlementConfirmed/);
  assert.match(settlementService, /sellSettlementConfirmed/);
  const postCall = settlementService.indexOf("postJournalEntry(tx,");
  assert.ok(postCall > settlementService.indexOf("confirmClientMoneyTradeAtSettlement(tx,"), "ledger must post after the pooled statement is confirmed");
  assert.ok(postCall < settlementService.indexOf("tx.settlement.update"), "ledger must post before the settlement is marked settled");
});

test("only money actually moving posts to the ledger", () => {
  // Deposit verification and withdrawal payment. Submitting, approving,
  // rejecting, and failing a movement change no economic position.
  assert.equal((cashService.match(/postJournalEntry\(/g) ?? []).length, 2);
  assert.match(cashService, /manualDepositRecorded/);
  assert.match(cashService, /withdrawalPaid/);

  // Blocking and releasing cash or securities reclassifies money inside one
  // client's own balance; the total owed to clients is unchanged.
  assert.doesNotMatch(orderService, /postJournalEntry/);

  // The client-money allocator is a sub-ledger; posting here as well would
  // double-count every trade.
  assert.doesNotMatch(clientMoneyService, /postJournalEntry/);
});

test("the chart is instantiated per broker and keyed on role", () => {
  assert.match(chartSeed, /export async function ensureChartOfAccounts/);
  assert.match(chartSeed, /brokerId_role/);
  // Re-seeding must not clobber a broker's renamed or renumbered presentation.
  assert.match(chartSeed, /update: \{\}/);
  assert.match(chartSeed, /still holds a balance and cannot be disabled/);
  assert.match(seed, /ensureChartOfAccounts/);
});

test("control accounts carry no per-client, per-bank, or per-instrument dimension", () => {
  const block = schema.match(/model LedgerAccount \{[\s\S]*?@@map\("ledger_accounts"\)/);
  assert.ok(block, "LedgerAccount model not found");
  // Per-client GL codes are the incumbent design this module exists to reject:
  // client balances belong in the sub-ledgers, the ledger holds the aggregate.
  assert.doesNotMatch(block[0], /clientId/);
  assert.doesNotMatch(block[0], /\baccountId\b/);
  assert.doesNotMatch(block[0], /bankName/);
  assert.doesNotMatch(block[0], /instrumentId/);
  assert.match(block[0], /@@unique\(\[brokerId, role\]\)/);
});

test("there is no voucher desk", () => {
  // Journal entries are derived from operational events. There is no model, and
  // no callable, whose purpose is to let a person hand-key a posting.
  assert.doesNotMatch(schema, /model Voucher/);
  assert.doesNotMatch(rules, /export (async )?function \w*[Vv]oucher/);
  assert.doesNotMatch(posting, /export (async )?function \w*[Vv]oucher/);

  // The one free-form path is a correction, and it is deliberately narrow: it
  // carries a mandatory description and is approved by a second person.
  assert.match(rules, /export function manualCorrection/);
  assert.match(rules, /manual_correction/);
});

test("journal lines are debit-or-credit with positive amounts", () => {
  const block = schema.match(/model JournalLine \{[\s\S]*?@@map\("journal_lines"\)/);
  assert.ok(block, "JournalLine model not found");
  assert.match(block[0], /side\s+String/);
  assert.match(block[0], /amount\s+Decimal\s+@db\.Decimal\(20, 4\)/);
  assert.match(rules, /Journal line amounts must be positive/);
});

test("stored balances are backed by a recomputation check", () => {
  // Storing running balances keeps the trial balance cheap; this is what keeps
  // storing them honest.
  assert.match(posting, /export async function computeStoredBalanceDrift/);
});

test("the payment gateway is a seam, matching the existing integration boundaries", () => {
  return read("../lib/integrations.ts").then((integrations) => {
    assert.match(integrations, /export interface PaymentGateway/);
    assert.match(integrations, /export class ManualPaymentGateway/);
    assert.match(integrations, /verifyWebhook/);
  });
});
