import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOrderType, parseDateOnly, parseOrderSide, parsePositiveFiniteNumber } from "../lib/order-input.ts";
import { computeCumulativeFillAmounts, D, toNum } from "../lib/money.ts";
import { computeConfiguredAmounts, computeCumulativeConfiguredFill } from "../lib/oms/fee-service.ts";
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
});

test("applies the brokerage minimum once while accumulating component fees across fills", () => {
  const policy = {
    scheduleId: "fees-v2",
    scheduleVersion: "2.0",
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
