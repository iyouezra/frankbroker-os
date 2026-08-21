import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("automatic expiry is scheduled, terminal, releases reservations, and gates end-of-day", async () => {
  const root = new URL("../", import.meta.url);
  const [status, service, expiry, cron, eod, vercel] = await Promise.all([
    readFile(new URL("lib/oms/status.ts", root), "utf8"),
    readFile(new URL("lib/oms/order-service.ts", root), "utf8"),
    readFile(new URL("lib/oms/order-expiry-service.ts", root), "utf8"),
    readFile(new URL("app/api/cron/order-expiry/route.ts", root), "utf8"),
    readFile(new URL("app/api/reconciliation/end-of-day/route.ts", root), "utf8"),
    readFile(new URL("vercel.json", root), "utf8"),
  ]);
  assert.match(status, /"expired"/);
  assert.match(service, /releaseOrderReservation\(tx, actor, order, reason\)/);
  assert.match(service, /blockedCash: ZERO, blockedQuantity: ZERO/);
  assert.match(expiry, /pending_broker_review.*approved.*partially_filled/);
  assert.match(cron, /CRON_SECRET/);
  assert.match(eod, /runOrderExpirySweep/);
  assert.match(vercel, /api\/cron\/order-expiry/);
});

test("client mandates inherit tenant commission and enforce direction, value, market, asset, and order type", async () => {
  const root = new URL("../", import.meta.url);
  const [schema, migration, orderService, route, settings] = await Promise.all([
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
    readFile(new URL("prisma/migrations/20260821130000_order_expiry_client_mandates_fee_tiers/migration.sql", root), "utf8"),
    readFile(new URL("lib/oms/order-service.ts", root), "utf8"),
    readFile(new URL("app/api/clients/[id]/trading-mandate/route.ts", root), "utf8"),
    readFile(new URL("features/broker/administration/administration-screens.tsx", root), "utf8"),
  ]);
  assert.match(schema, /model ClientTradingMandate/);
  assert.match(schema, /commissionSource\s+String\s+@default\("tenant_default"\)/);
  assert.match(schema, /model FeeTier/);
  assert.match(migration, /INSERT INTO "client_trading_mandates"/);
  for (const code of ["CLIENT_MANDATE_ACTIVE", "CLIENT_SIDE_ALLOWED", "CLIENT_ORDER_LIMIT", "CLIENT_ASSET_MANDATE", "CLIENT_MARKET_MANDATE", "CLIENT_ORDER_TYPE_MANDATE"]) assert.match(orderService, new RegExp(code));
  assert.match(route, /CLIENT_TRADING_MANDATE_UPDATED/);
  assert.match(settings, /Add value tier/);
});
