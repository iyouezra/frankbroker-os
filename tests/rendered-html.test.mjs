import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the FrankBroker product surface and PostgreSQL model", async () => {
  const [app, investorApp, investorData, investorStyles, layout, styles, clientsApi, reconciliationApi, schema, migration] = await Promise.all([
    readFile(new URL("app/frankbroker-app.tsx", root), "utf8"),
    readFile(new URL("app/investor/investor-app.tsx", root), "utf8"),
    readFile(new URL("lib/investor-data.ts", root), "utf8"),
    readFile(new URL("app/investor/investor.module.css", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/api/clients/route.ts", root), "utf8"),
    readFile(new URL("app/api/reconciliation/route.ts", root), "utf8"),
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
    readFile(new URL("prisma/migrations/20260714130000_init/migration.sql", root), "utf8"),
  ]);

  assert.match(app, /Good morning, Mekdes/);
  assert.match(app, /Order blotter/);
  assert.match(app, /Pre-trade validation/);
  assert.match(app, /PRINTABLE CONTRACT NOTE/);
  assert.match(app, /Upload trade confirmations/);
  assert.match(app, /Four-eyes control/);
  assert.match(app, /TELE/);
  assert.doesNotMatch(app, /Instrument master/);
  assert.match(investorApp, /Own a piece of Ethiopia/);
  assert.match(investorApp, /FrankScore 78/);
  assert.match(investorApp, /Review order/);
  assert.match(investorApp, /Open your investment account/);
  assert.match(investorApp, /Fayda ID number \(FIN\)/);
  assert.match(investorApp, /Retail investor/);
  assert.match(investorApp, /Business registration number/);
  assert.match(investorApp, /Live Fayda and tax verification/);
  assert.match(investorData, /"AWAB"/);
  assert.match(investorData, /GB2036/);
  assert.match(investorStyles, /--investor-aqua-400: #35e7d9/);
  assert.match(investorStyles, /@media \(max-width: 900px\)/);
  assert.match(layout, /FrankBroker OS/);
  assert.match(layout, /og\.png/);
  assert.match(styles, /--aqua:/);
  assert.match(styles, /\.client-card\.selected/);
  assert.match(clientsApi, /cashLedgerEntries/);
  assert.match(reconciliationApi, /RECONCILIATION_IMPORTED/);
  assert.match(schema, /provider = "postgresql"/);
  assert.match(schema, /model Order/);
  assert.match(schema, /model AuditLog/);
  assert.match(migration, /CREATE TABLE "orders"/);
  assert.doesNotMatch(app + layout, /codex-preview|react-loading-skeleton/);
});
