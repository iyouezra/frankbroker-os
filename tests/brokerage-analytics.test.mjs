import assert from "node:assert/strict";
import test from "node:test";

import { computeBrokerAnalytics } from "../lib/broker-analytics.ts";

test("performance separates brokerage earnings from pass-through market charges", () => {
  const order = {
    id: "ORD-1", createdAt: "2026-08-24T08:00:00Z", client: "Selam", clientCode: "CL-1", symbol: "TELE",
    side: "buy", status: "settled", estimatedGross: 100_000, estimatedFees: 85, estimatedNet: 100_085,
    executedBrokerage: 40, executedMarketCharges: 45, riskFlag: "none",
  };
  const analytics = computeBrokerAnalytics([order], [], "today", new Date("2026-08-24T12:00:00Z"));
  assert.equal(analytics.revenue, 40);
  assert.equal(analytics.marketCharges, 45);
  assert.equal(analytics.topClients[0].commission, 40);
  assert.equal(analytics.effectiveRate, .04);
});
