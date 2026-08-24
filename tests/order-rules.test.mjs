import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOrderType, parseDateOnly, parseOrderSide, parsePositiveFiniteNumber } from "../lib/order-input.ts";
import { computeCumulativeFillAmounts, D, toNum } from "../lib/money.ts";
import { applySubmittedBrokeragePolicy, computeConfiguredAmounts, computeCumulativeConfiguredFill, resolveFeePolicy, serializeFeeBreakdown } from "../lib/oms/fee-service.ts";
import { composeFeeRules } from "../lib/fee-schedule-view.ts";
import { orderPayloadHash } from "../lib/verification-service.ts";

test("rejects malformed order inputs before Decimal accounting", () => {
  assert.equal(parseOrderSide("buy"), "buy");
  assert.equal(parseOrderSide("short"), null);
  assert.equal(parsePositiveFiniteNumber(-100), null);
  assert.equal(parsePositiveFiniteNumber(Number.POSITIVE_INFINITY), null);
  assert.equal(parsePositiveFiniteNumber("125.5"), 125.5);
  assert.equal(parseDateOnly("2026-02-30"), null);
  assert.equal(parseDateOnly("2026-07-15"), "2026-07-15");
  assert.equal(normalizeOrderType("Stop-loss"), "stop_loss");
});

test("order authorization binds the Stop-Loss trigger price", () => {
  const order = {
    accountId: "acc_1",
    instrumentId: "ins_tele",
    side: "sell",
    quantity: 10,
    price: 305,
    orderType: "Stop-loss",
    validity: "gtd",
    goodTillDate: "2026-08-28",
    source: "investor_portal",
    submissionReference: "submit-1",
  };
  assert.notEqual(
    orderPayloadHash({ ...order, triggerPrice: 290 }),
    orderPayloadHash({ ...order, triggerPrice: 285 }),
  );
});

test("applies the minimum fee once across partial fills", () => {
  const first = computeCumulativeFillAmounts("buy", 5, 100, 0, 0, 0.005, 25);
  const second = computeCumulativeFillAmounts("buy", 5, 100, first.gross, first.fees, 0.005, 25);
  assert.deepEqual([toNum(first.fees), toNum(second.fees)], [25, 0]);
  assert.equal(toNum(first.net) + toNum(second.net), 1025);
});

test("recalculates fees from actual execution value rather than estimated effective rate", () => {
  const execution = computeCumulativeFillAmounts("buy", 1, 2_000, 0, 0, 0.005, 25);
  assert.equal(toNum(execution.gross), 2_000);
  assert.equal(toNum(execution.fees), 25);
  assert.equal(toNum(execution.net), 2_025);
});

test("itemizes broker, regulator, exchange, and CSD fees from a versioned rule", () => {
  const policy = {
    scheduleId: "fees-v2",
    scheduleVersion: "2.0",
    regulatoryScheduleId: "platform-fees-v3",
    regulatoryScheduleVersion: "3.0",
    assetClass: "equity",
    marketSegment: "main",
    brokeragePct: D(0.5),
    regulatorPct: D(0.1),
    exchangePct: D(0.2),
    csdPct: D(0.05),
    minimumFee: D(25),
    maximumFee: null,
  };
  const result = computeConfiguredAmounts("buy", 10, 1_000, policy);
  assert.deepEqual({
    brokerage: toNum(result.breakdown.brokerage),
    regulator: toNum(result.breakdown.regulator),
    exchange: toNum(result.breakdown.exchange),
    csd: toNum(result.breakdown.csd),
    total: toNum(result.breakdown.total),
    net: toNum(result.net),
  }, { brokerage: 50, regulator: 10, exchange: 20, csd: 5, total: 85, net: 10_085 });
  const snapshot = serializeFeeBreakdown(result.breakdown, policy);
  assert.equal(snapshot.policy.brokerageScheduleVersion, "2.0");
  assert.equal(snapshot.policy.regulatoryScheduleVersion, "3.0");
});

test("combines tenant brokerage with the platform-wide regulatory schedule", async () => {
  const policy = await resolveFeePolicy({
    feeSchedule: { findFirst: async () => ({ id: "tenant-fees", version: "2.1", rules: [{ assetClass: "equity", marketSegment: "main", brokeragePct: D(.65), regulatorPct: D(9), exchangePct: D(9), csdPct: D(9), minimumFee: D(30), maximumFee: null }] }) },
    platformFeeSchedule: { findFirst: async () => ({ id: "platform-fees", version: "4.0", rules: [{ assetClass: "equity", marketSegment: "main", regulatorPct: D(.15), exchangePct: D(.36), csdPct: D(0) }] }) },
  }, "brk_1", { assetClass: "equity", marketSegment: "main" }, { brokerageFeePct: D(.5), minimumFee: D(25) });
  assert.deepEqual({ brokerage: toNum(policy.brokeragePct), regulator: toNum(policy.regulatorPct), exchange: toNum(policy.exchangePct), csd: toNum(policy.csdPct) }, { brokerage: .65, regulator: .15, exchange: .36, csd: 0 });
  assert.equal(policy.regulatoryScheduleVersion, "4.0");
});

test("selects a tenant commission tier from total order value and keeps it across partial fills", async () => {
  const policy = await resolveFeePolicy({
    feeSchedule: { findFirst: async () => ({ id: "tenant-fees", version: "3.0", rules: [{ assetClass: "equity", marketSegment: "main", brokeragePct: D(.5), minimumFee: D(0), maximumFee: null, tiers: [{ minimumOrderValue: D(100_000), maximumOrderValue: null, brokeragePct: D(.25) }] }] }) },
    platformFeeSchedule: { findFirst: async () => ({ id: "platform-fees", version: "4.0", rules: [{ assetClass: "equity", marketSegment: "main", regulatorPct: D(0), exchangePct: D(0), csdPct: D(0) }] }) },
  }, "brk_1", { assetClass: "equity", marketSegment: "main" }, { brokerageFeePct: D(.5), minimumFee: D(0) }, new Date("2026-08-21"), D(120_000));
  assert.equal(toNum(policy.brokeragePct), .25);
  const empty = { brokerage: D(0), regulator: D(0), exchange: D(0), csd: D(0), total: D(0) };
  const first = computeCumulativeConfiguredFill("buy", 60, 1_000, 0, empty, policy);
  const second = computeCumulativeConfiguredFill("buy", 60, 1_000, first.gross, first.breakdown, policy);
  assert.deepEqual([toNum(first.breakdown.brokerage), toNum(second.breakdown.brokerage)], [150, 150]);
});

test("waives only brokerage commission for an eligible commission-free promotion", async () => {
  const promotion = { id: "promo-1", name: "First 30 days free", eligibility: "new_clients", startsOn: new Date("2026-08-01"), endsOn: new Date("2026-08-31"), newClientWindowDays: 30 };
  const policy = await resolveFeePolicy({
    feeSchedule: { findFirst: async () => ({ id: "tenant-fees", version: "3.1", promotions: [promotion], rules: [{ assetClass: "equity", marketSegment: "main", brokeragePct: D(.5), minimumFee: D(25), maximumFee: null, tiers: [] }] }) },
    platformFeeSchedule: { findFirst: async () => ({ id: "platform-fees", version: "4.0", rules: [{ assetClass: "equity", marketSegment: "main", regulatorPct: D(.1), exchangePct: D(.2), csdPct: D(.05) }] }) },
  }, "brk_1", { assetClass: "equity", marketSegment: "main" }, { brokerageFeePct: D(.5), minimumFee: D(25) }, new Date("2026-08-21"), D(100_000), { createdAt: new Date("2026-08-10") });
  const result = computeConfiguredAmounts("buy", 100, 1_000, policy);
  assert.deepEqual({ brokerage: toNum(result.breakdown.brokerage), regulator: toNum(result.breakdown.regulator), exchange: toNum(result.breakdown.exchange), csd: toNum(result.breakdown.csd) }, { brokerage: 0, regulator: 100, exchange: 200, csd: 50 });
  assert.equal(policy.commissionPromotion?.name, "First 30 days free");
  assert.equal(serializeFeeBreakdown(result.breakdown, policy).policy.commissionPromotion.id, "promo-1");
});

test("does not waive commission when a client is outside the new-client window", async () => {
  const policy = await resolveFeePolicy({
    feeSchedule: { findFirst: async () => ({ id: "tenant-fees", version: "3.1", promotions: [{ id: "promo-1", name: "First 30 days free", eligibility: "new_clients", startsOn: new Date("2026-08-01"), endsOn: new Date("2026-08-31"), newClientWindowDays: 30 }], rules: [{ assetClass: "equity", marketSegment: "main", brokeragePct: D(.5), minimumFee: D(25), maximumFee: null, tiers: [] }] }) },
    platformFeeSchedule: { findFirst: async () => ({ id: "platform-fees", version: "4.0", rules: [{ assetClass: "equity", marketSegment: "main", regulatorPct: D(0), exchangePct: D(0), csdPct: D(0) }] }) },
  }, "brk_1", { assetClass: "equity", marketSegment: "main" }, { brokerageFeePct: D(.5), minimumFee: D(25) }, new Date("2026-08-21"), D(100_000), { createdAt: new Date("2026-06-01") });
  assert.equal(toNum(policy.brokeragePct), .5);
  assert.equal(policy.commissionPromotion, null);
});

test("waives brokerage for every client during an all-client promotional period", async () => {
  const policy = await resolveFeePolicy({
    feeSchedule: { findFirst: async () => ({ id: "tenant-fees", version: "3.2", promotions: [{ id: "promo-2", name: "Trading week", eligibility: "all_clients", startsOn: new Date("2026-08-17"), endsOn: new Date("2026-08-21"), newClientWindowDays: null }], rules: [{ assetClass: "equity", marketSegment: "main", brokeragePct: D(.5), minimumFee: D(25), maximumFee: null, tiers: [] }] }) },
    platformFeeSchedule: { findFirst: async () => ({ id: "platform-fees", version: "4.0", rules: [{ assetClass: "equity", marketSegment: "main", regulatorPct: D(0), exchangePct: D(0), csdPct: D(0) }] }) },
  }, "brk_1", { assetClass: "equity", marketSegment: "main" }, { brokerageFeePct: D(.5), minimumFee: D(25) }, new Date("2026-08-21T18:00:00Z"), D(100_000), { createdAt: new Date("2020-01-01") });
  assert.equal(toNum(policy.brokeragePct), 0);
  assert.equal(policy.commissionPromotion?.name, "Trading week");
});

test("execution keeps the brokerage promotion accepted on the order submission date", () => {
  const executionDatePolicy = {
    scheduleId: "fees-new", scheduleVersion: "4.0", regulatoryScheduleId: "platform", regulatoryScheduleVersion: "5.0",
    assetClass: "equity", marketSegment: "main", brokeragePct: D(.75), regulatorPct: D(.1), exchangePct: D(.2), csdPct: D(.05), minimumFee: D(50), maximumFee: null,
  };
  const submitted = applySubmittedBrokeragePolicy(executionDatePolicy, {
    policy: {
      brokerageScheduleId: "fees-promo", brokerageScheduleVersion: "3.2", ratesPct: { brokerage: "0" }, minimumBrokerage: "0", maximumBrokerage: "0",
      commissionPromotion: { id: "promo-2", name: "Trading week", eligibility: "all_clients", startsOn: "2026-08-17", endsOn: "2026-08-21", newClientWindowDays: null },
    },
  });
  const result = computeConfiguredAmounts("buy", 100, 1_000, submitted);
  assert.equal(toNum(result.breakdown.brokerage), 0);
  assert.deepEqual([toNum(result.breakdown.regulator), toNum(result.breakdown.exchange), toNum(result.breakdown.csd)], [100, 200, 50]);
  assert.equal(submitted.scheduleVersion, "3.2");
  assert.equal(submitted.regulatoryScheduleVersion, "5.0");
});

test("rejects order pricing when Platform Admin has not published a market schedule", async () => {
  await assert.rejects(() => resolveFeePolicy({
    feeSchedule: { findFirst: async () => ({ id: "tenant-fees", version: "1.0", rules: [{ assetClass: "equity", marketSegment: "main", brokeragePct: D(.5), regulatorPct: D(0), exchangePct: D(0), csdPct: D(0), minimumFee: D(25), maximumFee: null }] }) },
    platformFeeSchedule: { findFirst: async () => null },
  }, "brk_1", { assetClass: "equity", marketSegment: "main" }, { brokerageFeePct: D(.5), minimumFee: D(25) }), (error) => error instanceof Response && error.status === 409);
});

test("composes Platform Admin fees for a future eligible tenant using broker defaults", () => {
  const rules = composeFeeRules([], [
    { assetClass: "equity", marketSegment: "main", regulatorPct: D(.15), exchangePct: D(.36), csdPct: D(0) },
    { assetClass: "bond", marketSegment: "main", regulatorPct: D(.005), exchangePct: D(.021), csdPct: D(0) },
  ], { brokerageFeePct: D(.7), minimumFee: D(40) });
  assert.deepEqual(rules.map((rule) => ({ asset: rule.assetClass, brokerage: rule.brokeragePct, csd: rule.csdPct, minimum: rule.minimumFee })), [
    { asset: "equity", brokerage: .7, csd: 0, minimum: 40 },
    { asset: "bond", brokerage: .7, csd: 0, minimum: 40 },
  ]);
});

test("applies the brokerage minimum once while accumulating component fees across fills", () => {
  const policy = {
    scheduleId: "fees-v2",
    scheduleVersion: "2.0",
    regulatoryScheduleId: "platform-fees-v3",
    regulatoryScheduleVersion: "3.0",
    assetClass: "equity",
    marketSegment: "main",
    brokeragePct: D(0.5),
    regulatorPct: D(0.1),
    exchangePct: D(0),
    csdPct: D(0),
    minimumFee: D(25),
    maximumFee: null,
  };
  const empty = { brokerage: D(0), regulator: D(0), exchange: D(0), csd: D(0), total: D(0) };
  const first = computeCumulativeConfiguredFill("buy", 5, 100, 0, empty, policy);
  const second = computeCumulativeConfiguredFill("buy", 5, 100, first.gross, first.breakdown, policy);
  assert.deepEqual([toNum(first.breakdown.brokerage), toNum(second.breakdown.brokerage)], [25, 0]);
  assert.deepEqual([toNum(first.breakdown.regulator), toNum(second.breakdown.regulator)], [0.5, 0.5]);
});
