import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeOrderValidity,
  orderValidityExpired,
  orderValidityLabel,
  parseOrderValidity,
} from "../lib/order-input.ts";
import { orderPayloadHash } from "../lib/verification-service.ts";

test("Day, GTC and GTD normalize to canonical instructions", () => {
  assert.equal(normalizeOrderValidity("Day"), "day");
  assert.equal(normalizeOrderValidity("Good till cancelled"), "gtc");
  assert.equal(normalizeOrderValidity("Good till date"), "gtd");
  assert.equal(orderValidityLabel("gtc"), "GTC");
  assert.equal(orderValidityLabel("gtd", "2026-08-28"), "GTD · 2026-08-28");
});

test("Market is Day-only while Limit and Stop-loss support GTC and GTD", () => {
  assert.deepEqual(parseOrderValidity({ validity: "day", orderType: "Market", businessDate: "2026-08-21" }), { validity: "day", goodTillDate: null });
  assert.deepEqual(parseOrderValidity({ validity: "gtc", orderType: "Limit", businessDate: "2026-08-21" }), { validity: "gtc", goodTillDate: null });
  assert.equal(parseOrderValidity({ validity: "gtd", goodTillDate: "2026-08-28", orderType: "Stop-loss", businessDate: "2026-08-21" }).goodTillDate?.toISOString(), "2026-08-28T00:00:00.000Z");
  assert.throws(() => parseOrderValidity({ validity: "gtc", orderType: "Market", businessDate: "2026-08-21" }), (error) => error instanceof Response && error.status === 400);
  assert.throws(() => parseOrderValidity({ validity: "gtd", orderType: "Limit", businessDate: "2026-08-21" }), (error) => error instanceof Response && error.status === 400);
  assert.throws(() => parseOrderValidity({ validity: "gtd", goodTillDate: "2026-08-21", orderType: "Limit", businessDate: "2026-08-21" }), (error) => error instanceof Response && error.status === 400);
  assert.throws(() => parseOrderValidity({ validity: "gtd", goodTillDate: "2027-08-22", orderType: "Limit", businessDate: "2026-08-21" }), (error) => error instanceof Response && error.status === 400);
});

test("expiry rules are inclusive for GTD and business-day scoped for Day", () => {
  assert.equal(orderValidityExpired({ validity: "day", submittedAt: new Date("2026-08-21T08:00:00Z"), now: new Date("2026-08-21T17:00:00Z") }), false);
  assert.equal(orderValidityExpired({ validity: "day", submittedAt: new Date("2026-08-21T08:00:00Z"), now: new Date("2026-08-22T08:00:00Z") }), true);
  assert.equal(orderValidityExpired({ validity: "gtc", submittedAt: new Date("2020-01-01T00:00:00Z"), now: new Date("2026-08-22T08:00:00Z") }), false);
  assert.equal(orderValidityExpired({ validity: "gtd", goodTillDate: new Date("2026-08-28T00:00:00Z"), now: new Date("2026-08-28T08:00:00Z") }), false);
  assert.equal(orderValidityExpired({ validity: "gtd", goodTillDate: new Date("2026-08-28T00:00:00Z"), now: new Date("2026-08-29T08:00:00Z") }), true);
});

test("client authorization binds validity and GTD date", () => {
  const instruction = { accountId: "acc", instrumentId: "ins", side: "buy", quantity: 10, price: 100, orderType: "Limit", validity: "gtd", goodTillDate: "2026-08-28", source: "investor_portal", submissionReference: "ref" };
  assert.notEqual(orderPayloadHash(instruction), orderPayloadHash({ ...instruction, validity: "gtc", goodTillDate: null }));
  assert.notEqual(orderPayloadHash(instruction), orderPayloadHash({ ...instruction, goodTillDate: "2026-08-29" }));
});

test("both portals, broker log, persistence and expiry choke points are wired", async () => {
  const root = new URL("../", import.meta.url);
  const [schema, migration, investorSheet, brokerDrawer, orderLog, orderService, tradeService] = await Promise.all([
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
    readFile(new URL("prisma/migrations/20260821110000_order_validity_instructions/migration.sql", root), "utf8"),
    readFile(new URL("features/investor/orders/order-sheets.tsx", root), "utf8"),
    readFile(new URL("features/broker/orders/order-drawers.tsx", root), "utf8"),
    readFile(new URL("features/broker/orders/order-log-screen.tsx", root), "utf8"),
    readFile(new URL("lib/oms/order-service.ts", root), "utf8"),
    readFile(new URL("lib/oms/trade-service.ts", root), "utf8"),
  ]);
  assert.match(schema, /goodTillDate\s+DateTime\?/);
  assert.match(migration, /orders_market_day_check/);
  assert.match(investorSheet, /VALIDITIES = \["day", "gtc", "gtd"\]/);
  assert.match(investorSheet, /goodTillDate/);
  assert.match(brokerDrawer, /GTC · Good till cancelled/);
  assert.match(orderLog, /Filter by validity/);
  assert.match(orderLog, /Expired instruction/);
  assert.match(orderService, /cannot be approved/);
  assert.match(tradeService, /cannot be executed/);
});
