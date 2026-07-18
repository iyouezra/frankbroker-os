import assert from "node:assert/strict";
import test from "node:test";

import { D, toNum } from "../lib/money.ts";
import {
  blockBuyCash,
  blockSellSecurities,
  captureBuyFill,
  captureSellFill,
  completeWithdrawalCash,
  creditVerifiedDeposit,
  releaseBuyCash,
  releaseSellSecurities,
  releaseWithdrawalCash,
  reserveWithdrawalCash,
  settleBuySecurities,
  settleSellCash,
} from "../lib/oms/ledger-service.ts";
import { assertTransition, canTransition, isExecutableStatus, ORDER_STATUSES } from "../lib/oms/status.ts";
import { validatePreTrade, validationPassed } from "../lib/oms/validation-service.ts";

const cash = (total, available = total, blocked = 0, unsettled = 0) => ({
  total: D(total),
  available: D(available),
  blocked: D(blocked),
  unsettled: D(unsettled),
});

const securities = (total, available = total, blocked = 0, unsettled = 0) => ({
  total: D(total),
  available: D(available),
  blocked: D(blocked),
  unsettled: D(unsettled),
});

test("buy order with sufficient cash blocks cash and release restores it", () => {
  const blocked = blockBuyCash(cash(10_000), 1_025);
  assert.deepEqual(
    [toNum(blocked.next.total), toNum(blocked.next.available), toNum(blocked.next.blocked)],
    [10_000, 8_975, 1_025],
  );
  assert.equal(blocked.entries[0].entryType, "block");

  const rejected = releaseBuyCash(blocked.next, 1_025, "Rejected order");
  assert.deepEqual(
    [toNum(rejected.next.total), toNum(rejected.next.available), toNum(rejected.next.blocked)],
    [10_000, 10_000, 0],
  );

  const cancelled = releaseBuyCash(blocked.next, 1_025, "Cancelled order");
  assert.equal(toNum(cancelled.next.available), 10_000);
});

test("verified deposit credits total and available cash atomically", () => {
  const result = creditVerifiedDeposit(cash(10_000), 2_500);
  assert.deepEqual(
    [toNum(result.next.total), toNum(result.next.available), toNum(result.next.blocked), result.entries[0].entryType],
    [12_500, 12_500, 0, "deposit"],
  );
  assert.throws(() => creditVerifiedDeposit(cash(10_000), 0), /Deposit must be positive/);
});

test("withdrawal reservation prevents double spend and payment debits only reserved cash", () => {
  const reserved = reserveWithdrawalCash(cash(10_000), 3_000);
  assert.deepEqual(
    [toNum(reserved.next.total), toNum(reserved.next.available), toNum(reserved.next.blocked)],
    [10_000, 7_000, 3_000],
  );
  assert.throws(() => reserveWithdrawalCash(reserved.next, 7_001), /Insufficient available cash/);
  const paid = completeWithdrawalCash(reserved.next, 3_000);
  assert.deepEqual(
    [toNum(paid.next.total), toNum(paid.next.available), toNum(paid.next.blocked), paid.entries[0].entryType],
    [7_000, 7_000, 0, "withdrawal"],
  );
});

test("rejected or failed withdrawal releases its exact reservation", () => {
  const reserved = reserveWithdrawalCash(cash(10_000), 3_000);
  const released = releaseWithdrawalCash(reserved.next, 3_000, "Payment failed");
  assert.deepEqual(
    [toNum(released.next.total), toNum(released.next.available), toNum(released.next.blocked), released.entries[0].entryType],
    [10_000, 10_000, 0, "release"],
  );
  assert.throws(() => releaseWithdrawalCash(reserved.next, 3_001), /exceeds reserved cash/);
});

test("buy order with insufficient cash fails validation and cannot block", () => {
  const checks = validatePreTrade({
    tenantMatches: true,
    kycApproved: true,
    accountActive: true,
    clientActive: true,
    instrumentTradable: true,
    instrumentEnabled: true,
    orderTypeAllowed: true,
    quantity: D(10),
    lotSize: 1,
    allowFractional: false,
    price: D(100),
    tickSize: D(0.5),
    side: "buy",
    requiredCash: D(1_025),
    availableCash: D(1_000),
    availableHoldings: D(0),
    projectedDailyGross: D(1_000),
    dailyLimit: D(10_000),
    sellNet: D(975),
  });
  assert.equal(validationPassed(checks), false);
  assert.equal(checks.find((check) => check.code === "SUFFICIENT_CASH")?.passed, false);
  assert.throws(() => blockBuyCash(cash(1_000), 1_025), /Insufficient available cash/);
});

test("partial and full buy fills update cash, holdings, and remaining reservation", () => {
  const approved = blockBuyCash(cash(10_000), 1_025);
  const first = captureBuyFill(approved.next, securities(0), 1_025, 512.5, 5, 500, 25);

  assert.deepEqual(
    [toNum(first.cash.next.total), toNum(first.cash.next.available), toNum(first.cash.next.blocked)],
    [9_475, 8_962.5, 512.5],
  );
  assert.deepEqual(
    [toNum(first.securities.next.total), toNum(first.securities.next.available), toNum(first.securities.next.unsettled)],
    [5, 0, 5],
  );

  const second = captureBuyFill(first.cash.next, first.securities.next, 512.5, 0, 5, 500, 0);
  assert.deepEqual(
    [toNum(second.cash.next.total), toNum(second.cash.next.available), toNum(second.cash.next.blocked)],
    [8_975, 8_975, 0],
  );
  assert.deepEqual(
    [toNum(second.securities.next.total), toNum(second.securities.next.unsettled)],
    [10, 10],
  );

  const settled = settleBuySecurities(second.securities.next, 10);
  assert.deepEqual(
    [toNum(settled.next.total), toNum(settled.next.available), toNum(settled.next.unsettled)],
    [10, 10, 0],
  );
});

test("buy trade cannot spend more than blocked and available cash", () => {
  const approved = blockBuyCash(cash(1_100), 1_025);
  assert.throws(
    () => captureBuyFill(approved.next, securities(0), 1_025, 0, 10, 2_000, 25),
    /Execution exceeds blocked and available cash/,
  );
});

test("sell order with sufficient holdings blocks and releases securities", () => {
  const blocked = blockSellSecurities(securities(10), 10);
  assert.deepEqual(
    [toNum(blocked.next.total), toNum(blocked.next.available), toNum(blocked.next.blocked)],
    [10, 0, 10],
  );
  const rejected = releaseSellSecurities(blocked.next, 10, "Rejected order");
  assert.deepEqual(
    [toNum(rejected.next.total), toNum(rejected.next.available), toNum(rejected.next.blocked)],
    [10, 10, 0],
  );
});

test("sell order with insufficient holdings fails validation and cannot oversell", () => {
  const checks = validatePreTrade({
    tenantMatches: true,
    kycApproved: true,
    accountActive: true,
    clientActive: true,
    instrumentTradable: true,
    instrumentEnabled: true,
    orderTypeAllowed: true,
    quantity: D(10),
    lotSize: 1,
    allowFractional: false,
    price: D(100),
    tickSize: D(0.5),
    side: "sell",
    requiredCash: D(0),
    availableCash: D(0),
    availableHoldings: D(5),
    projectedDailyGross: D(1_000),
    dailyLimit: D(10_000),
    sellNet: D(975),
  });
  assert.equal(checks.find((check) => check.code === "SUFFICIENT_HOLDINGS")?.passed, false);
  assert.throws(() => blockSellSecurities(securities(5), 10), /Insufficient available holdings/);

  const approved = blockSellSecurities(securities(10), 10);
  assert.throws(() => captureSellFill(cash(0), approved.next, 11, 1_100, 25), /blocked holdings/);
});

test("partial sell fill debits only the fill and settlement releases net proceeds", () => {
  const approved = blockSellSecurities(securities(10), 10);
  const partial = captureSellFill(cash(0), approved.next, 4, 400, 25);
  assert.deepEqual(
    [toNum(partial.securities.next.total), toNum(partial.securities.next.available), toNum(partial.securities.next.blocked)],
    [6, 0, 6],
  );
  assert.deepEqual(
    [toNum(partial.cash.next.total), toNum(partial.cash.next.available), toNum(partial.cash.next.unsettled)],
    [375, 0, 375],
  );

  const settled = settleSellCash(partial.cash.next, 375);
  assert.deepEqual(
    [toNum(settled.next.total), toNum(settled.next.available), toNum(settled.next.unsettled)],
    [375, 375, 0],
  );
});

test("state machine rejects execution and edits from terminal states", () => {
  assert.deepEqual(ORDER_STATUSES, [
    "draft", "submitted", "validation_failed", "pending_broker_review", "approved", "rejected",
    "cancelled", "partially_filled", "filled", "settlement_pending", "settled", "failed",
  ]);
  assert.equal(isExecutableStatus("approved"), true);
  assert.equal(isExecutableStatus("partially_filled"), true);
  assert.equal(isExecutableStatus("rejected"), false);
  assert.equal(isExecutableStatus("cancelled"), false);
  assert.equal(isExecutableStatus("failed"), false);
  assert.equal(canTransition("approved", "partially_filled"), true);
  assert.equal(canTransition("partially_filled", "filled"), true);
  assert.equal(canTransition("filled", "settlement_pending"), true);
  assert.equal(canTransition("settlement_pending", "settled"), true);
  assert.throws(() => assertTransition("rejected", "approved"), /Invalid order status transition/);
  assert.throws(() => assertTransition("settled", "approved"), /Invalid order status transition/);
});
