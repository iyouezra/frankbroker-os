import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the FrankBroker product surface and PostgreSQL model", async () => {
  const [app, layout, styles, clientsApi, reconciliationApi, schema, migration] = await Promise.all([
    readFile(new URL("app/frankbroker-app.tsx", root), "utf8"),
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
