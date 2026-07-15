import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOrderType, parseDateOnly, parseOrderSide, parsePositiveFiniteNumber } from "../lib/order-input.ts";
import { computeCumulativeFillAmounts, toNum } from "../lib/money.ts";

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
