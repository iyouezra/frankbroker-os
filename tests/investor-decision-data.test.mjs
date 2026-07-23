import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateBondOrder,
  formatMarketTimestamp,
  getBondCouponPayment,
  getBondPricePerUnit,
  getMarketSnapshot,
  investorBonds,
  investorStocks,
} from "../lib/investor-data.ts";

test("stock snapshots keep buyer and seller prices ordered with a consistent spread", () => {
  for (const stock of investorStocks) {
    const snapshot = getMarketSnapshot(stock);
    assert.ok(snapshot.bid.price < snapshot.ask.price);
    assert.equal(Number((snapshot.ask.price - snapshot.bid.price).toFixed(2)), snapshot.spread);
    assert.ok(snapshot.bid.quantity > 0);
    assert.ok(snapshot.ask.quantity > 0);
    assert.ok(snapshot.spreadPct > 0);
  }
});

test("market timestamps are formatted in Addis Ababa time", () => {
  assert.equal(formatMarketTimestamp("2026-07-23T09:42:00Z"), "12:42 pm");
});

test("bond price and coupon cash flow use face value and payment frequency", () => {
  const bond = investorBonds[0];
  assert.equal(getBondPricePerUnit(bond), 998.5);
  assert.equal(getBondCouponPayment(bond), 72.5);
});

test("bond amount fitting includes fees and leaves only whole units", () => {
  const pricePerBond = getBondPricePerUnit(investorBonds[0]);
  const allocation = calculateBondOrder(6_100, pricePerBond, (gross) => Math.max(25, gross * 0.005));
  assert.equal(allocation.units, 6);
  assert.equal(allocation.gross, 5_991);
  assert.equal(allocation.fees, 29.96);
  assert.equal(allocation.total, 6_020.96);
  assert.equal(allocation.unused, 79.04);
  assert.ok(allocation.total <= 6_100);
  assert.equal(Number((allocation.total + allocation.unused).toFixed(2)), 6_100);

  const smaller = calculateBondOrder(5_000, pricePerBond, (gross) => Math.max(25, gross * 0.005));
  assert.equal(smaller.units, 4);
  assert.ok(smaller.gross < investorBonds[0].minimumInvestment);
});

test("halted bond remains visible but cannot be treated as tradable", () => {
  const halted = investorBonds.find((bond) => bond.ticker === "GB2036");
  assert.equal(halted?.status, "halted");
  assert.equal(halted?.liquidity, "Trading paused");
});

test("investor API exposes canonical bond instrument fields without a schema change", async () => {
  const route = await readFile(new URL("../app/api/investor/route.ts", import.meta.url), "utf8");
  assert.match(route, /issuer: instrument\.issuer/);
  assert.match(route, /settlementCycle: instrument\.settlementCycle/);
  assert.match(route, /faceValue: instrument\.faceValue/);
  assert.match(route, /maturityDate: instrument\.maturityDate/);
  assert.match(route, /couponRate: instrument\.couponRate/);
  assert.match(route, /couponFrequency: instrument\.couponFrequency/);
});
