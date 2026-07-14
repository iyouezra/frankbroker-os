import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the FrankBroker product surface instead of the starter preview", async () => {
  const [app, layout, schema, migration] = await Promise.all([
    readFile(new URL("app/frankbroker-app.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0000_exotic_gravity.sql", root), "utf8"),
  ]);

  assert.match(app, /Good morning, Mekdes/);
  assert.match(app, /Order blotter/);
  assert.match(app, /Pre-trade validation/);
  assert.match(app, /PRINTABLE CONTRACT NOTE/);
  assert.match(layout, /FrankBroker OS/);
  assert.match(layout, /og\.png/);
  assert.match(schema, /export const orders/);
  assert.match(schema, /export const auditLogs/);
  assert.match(migration, /ORD-2026-1048/);
  assert.doesNotMatch(app + layout, /codex-preview|react-loading-skeleton/);
});
