import assert from "node:assert/strict";
import test from "node:test";
import { D, money, ZERO } from "../lib/money.ts";
import {
  assertBalanced,
  brokerFeesSwept,
  buyFillCaptured,
  buySettlementConfirmed,
  clientMoneyFunded,
  feeRemitted,
  gatewayDepositConfirmed,
  gatewaySweptToPool,
  idempotencyKeyFor,
  JournalBalanceError,
  LEDGER_ROLES,
  LEDGER_ROLE_TEMPLATE,
  manualDepositRecorded,
  pruneZeroLines,
  reverseLines,
  sellFillCaptured,
  sellSettlementConfirmed,
  signedAmount,
  unidentifiedReceiptAllocated,
  unidentifiedReceiptRecorded,
  withdrawalPaid,
} from "../lib/gl/journal-rules.ts";
import { chargeSweepLimit } from "../lib/client-money-operations-service.ts";

const VALUE_DATE = new Date("2026-08-16T00:00:00.000Z");
const ALL_ROLES = new Set(LEDGER_ROLE_TEMPLATE.map((item) => item.role));

const breakdown = (brokerage, regulator, exchange, csd) => ({
  brokerage: D(brokerage),
  regulator: D(regulator),
  exchange: D(exchange),
  csd: D(csd),
  total: money(D(brokerage).plus(regulator).plus(exchange).plus(csd)),
});

const lineFor = (entry, role) => entry.lines.find((line) => line.role === role);

/** Debit-positive net movement per role across a list of entries. */
function trialBalance(entries) {
  const totals = new Map();
  for (const entry of entries) {
    for (const line of pruneZeroLines(entry.lines)) {
      totals.set(line.role, money((totals.get(line.role) ?? ZERO).plus(signedAmount(line))));
    }
  }
  return totals;
}

test("a journal entry must balance, use positive amounts, and name known roles", () => {
  assert.throws(() => assertBalanced([
    { role: LEDGER_ROLES.clientMoneyPooledBank, side: "debit", amount: D(100), memo: "in" },
    { role: LEDGER_ROLES.clientMoneyPayableSettled, side: "credit", amount: D(90), memo: "out" },
  ]), JournalBalanceError);

  assert.throws(() => assertBalanced([
    { role: LEDGER_ROLES.clientMoneyPooledBank, side: "debit", amount: D(-100), memo: "in" },
    { role: LEDGER_ROLES.clientMoneyPayableSettled, side: "credit", amount: D(-100), memo: "out" },
  ]), /must be positive/);

  assert.throws(() => assertBalanced([
    { role: LEDGER_ROLES.clientMoneyPooledBank, side: "debit", amount: D(100), memo: "lonely" },
  ]), /at least one debit and one credit/);

  assert.throws(() => assertBalanced([
    { role: "invented_role", side: "debit", amount: D(100), memo: "in" },
    { role: LEDGER_ROLES.clientMoneyPayableSettled, side: "credit", amount: D(100), memo: "out" },
  ]), /Unknown ledger role/);

  const balanced = assertBalanced([
    { role: LEDGER_ROLES.clientMoneyPooledBank, side: "debit", amount: D(100), memo: "in" },
    { role: LEDGER_ROLES.clientMoneyPayableSettled, side: "credit", amount: D(100), memo: "out" },
  ]);
  assert.equal(balanced.totalDebit.toFixed(2), "100.00");
  assert.equal(balanced.totalCredit.toFixed(2), "100.00");
});

test("a role the tenant has not enabled cannot be posted to", () => {
  const lines = [
    { role: LEDGER_ROLES.clientMoneyGateway, side: "debit", amount: D(100), memo: "in" },
    { role: LEDGER_ROLES.clientMoneyPayableSettled, side: "credit", amount: D(100), memo: "out" },
  ];
  assert.doesNotThrow(() => assertBalanced(lines, { postableRoles: ALL_ROLES }));
  // A broker with no payment gateway configured.
  const withoutGateway = new Set([...ALL_ROLES].filter((role) => role !== LEDGER_ROLES.clientMoneyGateway));
  assert.throws(() => assertBalanced(lines, { postableRoles: withoutGateway }), /not enabled for posting/);
});

test("a rounding plug may never exceed five santim", () => {
  const plug = (amount) => [
    { role: LEDGER_ROLES.clientMoneyPooledBank, side: "debit", amount: D(amount), memo: "in" },
    { role: LEDGER_ROLES.roundingDifferences, side: "credit", amount: D(amount), memo: "plug" },
  ];
  assert.doesNotThrow(() => assertBalanced(plug("0.05")));
  assert.throws(() => assertBalanced(plug("0.06")), /may not exceed/);
});

test("a buy fill charges the client and splits fees into income and three payables", () => {
  const entry = buyFillCaptured({
    tradeId: "TRD-2026-ABC123",
    clientAccountId: "acc_1",
    instrumentId: "ins_wgbx",
    gross: D(100000),
    breakdown: breakdown(500, 20, 30, 10),
    valueDate: VALUE_DATE,
  });
  const lines = pruneZeroLines(entry.lines);
  assert.equal(lines.length, 6);
  assertBalanced(lines, { postableRoles: ALL_ROLES });

  assert.equal(lineFor(entry, LEDGER_ROLES.clientMoneyPayableSettled).side, "debit");
  assert.equal(lineFor(entry, LEDGER_ROLES.clientMoneyPayableSettled).amount.toFixed(2), "100560.00");
  assert.equal(lineFor(entry, LEDGER_ROLES.settlementPayable).amount.toFixed(2), "100000.00");
  assert.equal(lineFor(entry, LEDGER_ROLES.brokerageIncome).amount.toFixed(2), "500.00");
  assert.equal(lineFor(entry, LEDGER_ROLES.ecmaLevyPayable).amount.toFixed(2), "20.00");
  assert.equal(lineFor(entry, LEDGER_ROLES.esxFeePayable).amount.toFixed(2), "30.00");
  assert.equal(lineFor(entry, LEDGER_ROLES.csdFeePayable).amount.toFixed(2), "10.00");
  // Levies are collected as agent, so none of them may be income.
  for (const role of [LEDGER_ROLES.ecmaLevyPayable, LEDGER_ROLES.esxFeePayable, LEDGER_ROLES.csdFeePayable]) {
    assert.equal(LEDGER_ROLE_TEMPLATE.find((item) => item.role === role).accountClass, "liability");
  }
});

test("a sell fill books gross receivable and credits the client net, into unsettled", () => {
  const entry = sellFillCaptured({
    tradeId: "TRD-2026-DEF456",
    clientAccountId: "acc_1",
    instrumentId: "ins_wgbx",
    gross: D(50000),
    breakdown: breakdown(250, 10, 15, 5),
    valueDate: VALUE_DATE,
  });
  assertBalanced(pruneZeroLines(entry.lines), { postableRoles: ALL_ROLES });
  assert.equal(lineFor(entry, LEDGER_ROLES.settlementReceivable).side, "debit");
  assert.equal(lineFor(entry, LEDGER_ROLES.settlementReceivable).amount.toFixed(2), "50000.00");
  assert.equal(lineFor(entry, LEDGER_ROLES.clientMoneyPayableUnsettled).amount.toFixed(2), "49720.00");
  assert.equal(lineFor(entry, LEDGER_ROLES.brokerageIncome).amount.toFixed(2), "250.00");
});

test("fee legs that round to nothing do not occupy a line", () => {
  const entry = buyFillCaptured({
    tradeId: "TRD-2026-GHI789",
    clientAccountId: "acc_1",
    instrumentId: "ins_wgbx",
    gross: D(100000),
    breakdown: breakdown(500, 20, 30, 0),
    valueDate: VALUE_DATE,
  });
  const lines = pruneZeroLines(entry.lines);
  assert.equal(lines.length, 5);
  assert.equal(lines.some((line) => line.role === LEDGER_ROLES.csdFeePayable), false);
  assertBalanced(lines, { postableRoles: ALL_ROLES });
});

test("a fee breakdown whose parts do not sum to its total is rejected, not plugged", () => {
  const inconsistent = { brokerage: D(500), regulator: D(20), exchange: D(30), csd: D(10), total: D(561) };
  assert.throws(() => buyFillCaptured({
    tradeId: "TRD-2026-BAD",
    clientAccountId: "acc_1",
    instrumentId: "ins_wgbx",
    gross: D(100000),
    breakdown: inconsistent,
    valueDate: VALUE_DATE,
  }), /does not sum to its total/);
  assert.throws(() => sellFillCaptured({
    tradeId: "TRD-2026-BAD",
    clientAccountId: "acc_1",
    instrumentId: "ins_wgbx",
    gross: D(100000),
    breakdown: inconsistent,
    valueDate: VALUE_DATE,
  }), /does not sum to its total/);
});

test("sell fees may not exceed the proceeds of the fill", () => {
  assert.throws(() => sellFillCaptured({
    tradeId: "TRD-2026-TINY",
    clientAccountId: "acc_1",
    instrumentId: "ins_wgbx",
    gross: D(10),
    breakdown: breakdown(25, 0, 0, 0),
    valueDate: VALUE_DATE,
  }), /cannot exceed the gross proceeds/);
});

test("a gateway fee cannot exceed the deposit it is taken from", () => {
  assert.throws(() => gatewayDepositConfirmed({
    movementId: "MOV-1",
    clientAccountId: "acc_1",
    gross: D(100),
    providerFee: D(150),
    valueDate: VALUE_DATE,
    provider: "demo",
  }), /cannot exceed the deposit/);
});

test("a gateway deposit credits the client gross and expenses the provider cut", () => {
  const entry = gatewayDepositConfirmed({
    movementId: "MOV-2",
    clientAccountId: "acc_1",
    gross: D(10000),
    providerFee: D(150),
    valueDate: VALUE_DATE,
    provider: "demo",
  });
  assertBalanced(pruneZeroLines(entry.lines), { postableRoles: ALL_ROLES });
  assert.equal(lineFor(entry, LEDGER_ROLES.clientMoneyPayableSettled).amount.toFixed(2), "10000.00");
  assert.equal(lineFor(entry, LEDGER_ROLES.clientMoneyGateway).amount.toFixed(2), "9850.00");
  assert.equal(lineFor(entry, LEDGER_ROLES.bankAndGatewayCharges).amount.toFixed(2), "150.00");
});

test("reversing an entry mirrors every side and still balances", () => {
  const entry = buyFillCaptured({
    tradeId: "TRD-2026-REV",
    clientAccountId: "acc_1",
    instrumentId: "ins_wgbx",
    gross: D(100000),
    breakdown: breakdown(500, 20, 30, 10),
    valueDate: VALUE_DATE,
  });
  const original = pruneZeroLines(entry.lines);
  const reversal = reverseLines(original);
  assert.equal(reversal.length, original.length);
  for (const [index, line] of reversal.entries()) {
    assert.equal(line.role, original[index].role);
    assert.equal(line.amount.toFixed(2), original[index].amount.toFixed(2));
    assert.notEqual(line.side, original[index].side);
  }
  assertBalanced(reversal, { postableRoles: ALL_ROLES });
  // Posting both leaves every account exactly where it started.
  const net = trialBalance([{ lines: [...original, ...reversal] }]);
  for (const [, value] of net) assert.equal(value.toFixed(2), "0.00");
});

test("idempotency keys are stable per event and distinct across event kinds", () => {
  const capture = { sourceType: "trade_capture", sourceId: "TRD-1", eventKey: "capture" };
  assert.equal(idempotencyKeyFor(capture), idempotencyKeyFor({ ...capture }));
  assert.notEqual(idempotencyKeyFor(capture), idempotencyKeyFor({ ...capture, eventKey: "reversal" }));
  assert.notEqual(idempotencyKeyFor(capture), idempotencyKeyFor({ ...capture, sourceType: "settlement" }));
});

test("the chart stays small, fixed, and free of per-client dimensions", () => {
  const roles = LEDGER_ROLE_TEMPLATE.map((item) => item.role);
  assert.equal(new Set(roles).size, roles.length, "roles must be unique");
  // A hard ceiling is what stops a chart that grows with the client book — the
  // mistake this whole design exists to avoid.
  assert.ok(roles.length >= 15 && roles.length <= 30, `expected 15-30 control accounts, found ${roles.length}`);

  const codes = LEDGER_ROLE_TEMPLATE.map((item) => item.defaultCode);
  assert.equal(new Set(codes).size, codes.length, "default codes must be unique");

  const classes = new Set(["asset", "liability", "equity", "income", "expense", "memorandum"]);
  for (const item of LEDGER_ROLE_TEMPLATE) {
    assert.ok(classes.has(item.accountClass), `${item.role} has an invalid class`);
    assert.ok(["debit", "credit"].includes(item.normalBalance), `${item.role} has an invalid normal balance`);
    assert.ok(item.statementCaption.length > 0, `${item.role} needs an IFRS caption for the statutory export`);
  }
});

test("builders address accounts by role, never by code, so brokers may renumber", () => {
  const entries = [
    buyFillCaptured({ tradeId: "T", clientAccountId: "a", instrumentId: "i", gross: D(100), breakdown: breakdown(1, 0, 0, 0), valueDate: VALUE_DATE }),
    withdrawalPaid({ movementId: "M", clientAccountId: "a", pooledBankAccountId: "p", amount: D(50), bankReference: "R", valueDate: VALUE_DATE }),
    feeRemitted({ remittanceId: "REM", payee: "ecma", amount: D(20), valueDate: VALUE_DATE }),
  ];
  for (const entry of entries) {
    for (const line of entry.lines) {
      assert.ok(ALL_ROLES.has(line.role), `${line.role} is not a known role`);
      assert.equal(/^\d+$/.test(line.role), false, "a journal line must not be addressed by a numeric code");
      assert.equal("code" in line, false, "journal lines carry roles, not codes");
    }
  }
});

test("a full day of activity nets to zero and leaves client money adequate", () => {
  const pool = "pool_cbe";
  const account = "acc_1";
  const entries = [
    manualDepositRecorded({ movementId: "MOV-D", clientAccountId: account, pooledBankAccountId: pool, amount: D(200000), bankReference: "CBE-1", valueDate: VALUE_DATE }),
    buyFillCaptured({ tradeId: "TRD-B", clientAccountId: account, instrumentId: "ins", gross: D(100000), breakdown: breakdown(500, 20, 30, 10), valueDate: VALUE_DATE }),
    buySettlementConfirmed({ settlementId: "STL-B", tradeId: "TRD-B", pooledBankAccountId: pool, gross: D(100000), valueDate: VALUE_DATE }),
    sellFillCaptured({ tradeId: "TRD-S", clientAccountId: account, instrumentId: "ins", gross: D(50000), breakdown: breakdown(250, 10, 15, 5), valueDate: VALUE_DATE }),
    sellSettlementConfirmed({ settlementId: "STL-S", tradeId: "TRD-S", clientAccountId: account, pooledBankAccountId: pool, gross: D(50000), netToClient: D(49720), valueDate: VALUE_DATE }),
    withdrawalPaid({ movementId: "MOV-W", clientAccountId: account, pooledBankAccountId: pool, amount: D(10000), bankReference: "CBE-2", valueDate: VALUE_DATE }),
    unidentifiedReceiptRecorded({ receiptId: "RCP-1", pooledBankAccountId: pool, amount: D(1500), bankReference: "CBE-3", valueDate: VALUE_DATE }),
    unidentifiedReceiptAllocated({ receiptId: "RCP-1", clientAccountId: account, amount: D(1500), valueDate: VALUE_DATE }),
    gatewaySweptToPool({ sweepReference: "SWP-1", amount: ZERO, pooledBankAccountId: pool, valueDate: VALUE_DATE }),
    // Everything the clients paid in fees — 750 brokerage plus 90 of levies —
    // has to leave segregated money, not just the brokerage share. The levies
    // are then remitted out of the operating account.
    brokerFeesSwept({ sweepId: "SWP-FEE", pooledBankAccountId: pool, amount: D(840), valueDate: VALUE_DATE }),
    feeRemitted({ remittanceId: "REM-ECMA", payee: "ecma", amount: D(30), valueDate: VALUE_DATE }),
  ];

  let debits = ZERO;
  let credits = ZERO;
  for (const entry of entries) {
    const lines = pruneZeroLines(entry.lines);
    if (!lines.length) continue;
    const totals = assertBalanced(lines, { postableRoles: ALL_ROLES });
    debits = money(debits.plus(totals.totalDebit));
    credits = money(credits.plus(totals.totalCredit));
  }
  assert.equal(debits.toFixed(2), credits.toFixed(2));

  const totals = trialBalance(entries);
  const at = (role) => totals.get(role) ?? ZERO;

  // The trial balance nets to zero across every account touched.
  const net = [...totals.values()].reduce((sum, value) => money(sum.plus(value)), ZERO);
  assert.equal(net.toFixed(2), "0.00");

  // Client money adequacy: what is held for clients versus what is owed them.
  // Signs are debit-positive, so liabilities come back negative.
  const held = money(at(LEDGER_ROLES.clientMoneyPooledBank).plus(at(LEDGER_ROLES.clientMoneyGateway)).plus(at(LEDGER_ROLES.settlementReceivable)));
  const owed = money(
    at(LEDGER_ROLES.clientMoneyPayableSettled)
      .plus(at(LEDGER_ROLES.clientMoneyPayableUnsettled))
      .plus(at(LEDGER_ROLES.unidentifiedReceipts))
      .plus(at(LEDGER_ROLES.settlementPayable)),
  ).negated();
  assert.equal(held.toFixed(2), owed.toFixed(2), "segregated assets must equal client obligations");

  // Brokerage is recognised as income; the three levies sit as liabilities.
  assert.equal(at(LEDGER_ROLES.brokerageIncome).negated().toFixed(2), "750.00");
  assert.equal(at(LEDGER_ROLES.esxFeePayable).negated().toFixed(2), "45.00");
  // ECMA collected 30 and remitted 30, so nothing remains outstanding.
  assert.equal(at(LEDGER_ROLES.ecmaLevyPayable).toFixed(2), "0.00");
});

test("fees left sitting in segregated money show up as a surplus until they are swept", () => {
  // The same day, but without the fee sweep. The pool then holds 840 more than
  // is owed to clients: the brokerage and levies the clients paid in. Whether
  // that is tolerable, and for how long, is a rulebook question — the ledger's
  // job is to make it visible rather than net it away.
  const pool = "pool_cbe";
  const account = "acc_1";
  const entries = [
    manualDepositRecorded({ movementId: "MOV-D", clientAccountId: account, pooledBankAccountId: pool, amount: D(200000), bankReference: "CBE-1", valueDate: VALUE_DATE }),
    buyFillCaptured({ tradeId: "TRD-B", clientAccountId: account, instrumentId: "ins", gross: D(100000), breakdown: breakdown(500, 20, 30, 10), valueDate: VALUE_DATE }),
    buySettlementConfirmed({ settlementId: "STL-B", tradeId: "TRD-B", pooledBankAccountId: pool, gross: D(100000), valueDate: VALUE_DATE }),
  ];
  const totals = trialBalance(entries);
  const at = (role) => totals.get(role) ?? ZERO;
  const held = at(LEDGER_ROLES.clientMoneyPooledBank);
  const owed = money(at(LEDGER_ROLES.clientMoneyPayableSettled).plus(at(LEDGER_ROLES.settlementPayable))).negated();
  assert.equal(money(held.minus(owed)).toFixed(2), "560.00");
});

test("a charge sweep is derived from the smallest reconciled and earned balance", () => {
  assert.equal(chargeSweepLimit({ protectedSurplus: 560, collectedCharges: 840, previousSweeps: 300, poolBookBalance: 1_000, poolStatementBalance: 900 }).toFixed(2), "540.00");
  assert.equal(chargeSweepLimit({ protectedSurplus: -1, collectedCharges: 840, previousSweeps: 0, poolBookBalance: 1_000, poolStatementBalance: 1_000 }).toFixed(2), "0.00");
  assert.equal(chargeSweepLimit({ protectedSurplus: 560, collectedCharges: 840, previousSweeps: 840, poolBookBalance: 1_000, poolStatementBalance: 1_000 }).toFixed(2), "0.00");
});

test("a broker funding a shortfall moves its own cash into segregated money", () => {
  const entry = clientMoneyFunded({ fundingId: "FUND-1", pooledBankAccountId: "pool_cbe", amount: D(750), valueDate: VALUE_DATE });
  assertBalanced(pruneZeroLines(entry.lines), { postableRoles: ALL_ROLES });
  assert.equal(lineFor(entry, LEDGER_ROLES.clientMoneyPooledBank).side, "debit");
  assert.equal(lineFor(entry, LEDGER_ROLES.brokerOperatingBank).side, "credit");
});
