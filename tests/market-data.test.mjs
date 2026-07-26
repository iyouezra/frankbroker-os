import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MARKET_PERMISSIONS, hasPermission } from "../lib/frank.ts";
import { compareOrderLimit, isQuoteStale, marketLabel } from "../lib/market-data/format.ts";
import { normalizeEsxInstrument, normalizeEsxSummary } from "../lib/market-data/esx-normalizer.ts";
import { DevelopmentMockMarketDataProvider } from "../lib/market-data/mock-provider.ts";
import { MARKET_RANGES } from "../lib/market-data/types.ts";
import { isMarketLinkEligible } from "../lib/order-log.ts";

test("ESX market status and quote responses normalize to stable internal types", () => {
  const summary = normalizeEsxSummary({
    status: "Pre-Open",
    tradingSession: "Opening auction",
    timestamp: "2026-07-26T06:15:00Z",
    feedStatus: "delayed",
    turnover: "150000",
  });
  assert.equal(summary.marketStatus, "pre_open");
  assert.equal(summary.feedStatus, "delayed");
  assert.equal(summary.totalTurnover, 150000);
  assert.equal(summary.totalVolume, null);

  const quote = normalizeEsxInstrument({
    id: "ins_tele",
    symbol: "ETEL",
    lastTradedPrice: "1260",
    previousClose: "1240",
    bestBid: "1258",
    bestAsk: "1263",
    status: "open",
    timestamp: "2026-07-26T06:15:00Z",
    feedStatus: "live",
  });
  assert.equal(quote.change, 20);
  assert.equal(Number(quote.changePercent.toFixed(4)), Number((20 / 1240 * 100).toFixed(4)));
  assert.equal(quote.bestOffer, 1263);
});

test("stale, missing, and neutral order-limit quote contexts are explicit", () => {
  const now = Date.parse("2026-07-26T10:00:00Z");
  assert.equal(isQuoteStale("2026-07-26T09:59:31Z", now, 30_000), false);
  assert.equal(isQuoteStale("2026-07-26T09:59:29Z", now, 30_000), true);
  assert.equal(isQuoteStale(null, now, 30_000), true);
  const quote = { bestBid: 100, bestOffer: 105, updatedAt: "2026-07-26T09:59:45Z" };
  assert.equal(compareOrderLimit(99, quote, now, 30_000), "Below Best Bid");
  assert.equal(compareOrderLimit(100, quote, now, 30_000), "At Best Bid");
  assert.equal(compareOrderLimit(103, quote, now, 30_000), "Between Bid and Offer");
  assert.equal(compareOrderLimit(105, quote, now, 30_000), "At Best Offer");
  assert.equal(compareOrderLimit(106, quote, now, 30_000), "Above Best Offer");
  assert.equal(compareOrderLimit(103, { ...quote, updatedAt: null }, now, 30_000), "Quote Stale");
  assert.equal(marketLabel("development_mock"), "Development mock");
});

test("development provider supports only declared chart ranges and labels data as non-live", async () => {
  const provider = new DevelopmentMockMarketDataProvider();
  const summary = await provider.getMarketSummary();
  assert.equal(summary.feedStatus, "development_mock");
  assert.equal(summary.source, "FrankBroker simulated ESX demo feed");
  assert.equal(provider.mode, "development_mock");
  for (const range of MARKET_RANGES) assert.ok((await provider.getInstrumentHistory("ins_tele", range)).length > 1);
});

test("market-linked OMS selection excludes final and fully filled orders", () => {
  assert.equal(isMarketLinkEligible({ status: "approved", remainingQuantity: 100 }), true);
  assert.equal(isMarketLinkEligible({ status: "partially_filled", remainingQuantity: 25 }), true);
  for (const status of ["filled", "cancelled", "rejected", "settled", "failed"]) {
    assert.equal(isMarketLinkEligible({ status, remainingQuantity: 100 }), false);
  }
  assert.equal(isMarketLinkEligible({ status: "approved", remainingQuantity: 0 }), false);
});

test("market permissions separate read-only viewing from order linkage", () => {
  assert.equal(hasPermission("management", MARKET_PERMISSIONS.view), true);
  assert.equal(hasPermission("management", MARKET_PERMISSIONS.orderLink), false);
  assert.equal(hasPermission("trader", MARKET_PERMISSIONS.orderLink), true);
});

test("market endpoints enforce tenant entitlement, roles, supported ranges, and production-safe provider selection", async () => {
  const [route, provider, orderRoute] = await Promise.all([
    readFile(new URL("../app/api/market/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/market-data/provider.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /requirePermission\(request, "market\.view"\)/);
  assert.match(route, /brokerId, enabled: true/);
  assert.match(route, /!permitted\.includes\(instrumentId\)/);
  assert.match(route, /MARKET_RANGES\.includes/);
  assert.match(provider, /process\.env\.NODE_ENV !== "production"/);
  assert.match(provider, /process\.env\.MARKET_DATA_PROVIDER === "demo"/);
  assert.match(provider, /UnavailableMarketDataProvider/);
  assert.match(orderRoute, /eligibleForMarket/);
  assert.match(orderRoute, /remainingQuantity: \{ gt: 0 \}/);
});
