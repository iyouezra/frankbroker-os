import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  REQUIRED_EOD_FEEDS,
  assertBusinessDayOpen,
  normalizeReconciliationRows,
  processReconciliationBatch,
  reconciliationContentHash,
} from "../lib/reconciliation-service.ts";

const date = new Date("2026-08-19T00:00:00.000Z");

test("reconciliation content hashes are stable across row ordering", () => {
  const first = [
    { reference: "TRD-2", type: "cash", actualValue: "12.50" },
    { reference: "TRD-1", type: "securities", actualValue: "10" },
  ];
  const second = [...first].reverse();
  assert.equal(reconciliationContentHash("esx_executions", date, first), reconciliationContentHash("esx_executions", date, second));
  assert.notEqual(reconciliationContentHash("fees_settlement", date, first), reconciliationContentHash("esx_executions", date, first));
});

test("source rows are feed-specific, decimal-normalized and unique", () => {
  assert.deepEqual(normalizeReconciliationRows("esx_executions", [
    { reference: " TRD-1 ", type: " CASH ", actualValue: "0012.5000" },
  ]), [{ reference: "TRD-1", type: "cash", actualValue: "12.5" }]);

  assert.throws(
    () => normalizeReconciliationRows("bank_balances", [{ reference: "POOL-1", type: "cash", actualValue: "12" }]),
    (error) => error instanceof Response && error.status === 400,
  );
  assert.throws(
    () => normalizeReconciliationRows("csd_positions", [
      { reference: "ACC|TELE", type: "csd_position", actualValue: "10" },
      { reference: "ACC|TELE", type: "csd_position", actualValue: "10" },
    ]),
    (error) => error instanceof Response && error.status === 400,
  );
});

test("closed days and duplicate content fail before book matching", async () => {
  const rows = [{ reference: "TRD-1", type: "cash", actualValue: "12.5" }];
  await assert.rejects(
    () => processReconciliationBatch({
      db: { businessDayControl: { findUnique: async () => ({ status: "closed" }) } },
      brokerId: "broker",
      actorId: "user",
      fileName: "esx.csv",
      feedType: "esx_executions",
      rows,
      businessDate: date,
    }),
    (error) => error instanceof Response && error.status === 409,
  );

  await assert.rejects(
    () => processReconciliationBatch({
      db: {
        businessDayControl: { findUnique: async () => null },
        reconciliationBatch: { findFirst: async () => ({ id: "REC-EXISTING" }) },
      },
      brokerId: "broker",
      actorId: "user",
      fileName: "esx.csv",
      feedType: "esx_executions",
      rows,
      businessDate: date,
    }),
    (error) => error instanceof Response && error.status === 409 && /REC-EXISTING/.test(error.statusText || "") === false,
  );
});

test("the financial cutoff permits open or reopened days and blocks closed days", async () => {
  await assert.doesNotReject(() => assertBusinessDayOpen({
    businessDayControl: { findUnique: async () => ({ status: "reopened" }) },
  }, "broker", date));
  await assert.rejects(
    () => assertBusinessDayOpen({
      businessDayControl: { findUnique: async () => ({ status: "closed" }) },
    }, "broker", date),
    (error) => error instanceof Response && error.status === 409,
  );
});

test("EOD requires independent external evidence for exchange, CSD, bank, fees and settlement", () => {
  assert.deepEqual(REQUIRED_EOD_FEEDS, ["esx_executions", "csd_positions", "bank_balances", "fees_settlement"]);
});

test("migration and APIs preserve lineage and enforce formal close/reopen controls", async () => {
  const root = new URL("../", import.meta.url);
  const [migration, schema, closeRoute, resolveRoute, signoffRoute, orderRoute, orderActionRoute, cashRoute, cashActionRoute, investorRoute] = await Promise.all([
    readFile(new URL("prisma/migrations/20260819120000_production_reconciliation_eod/migration.sql", root), "utf8"),
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
    readFile(new URL("app/api/reconciliation/end-of-day/route.ts", root), "utf8"),
    readFile(new URL("app/api/reconciliation/[id]/resolve/route.ts", root), "utf8"),
    readFile(new URL("app/api/reconciliation/[id]/sign-off/route.ts", root), "utf8"),
    readFile(new URL("app/api/orders/route.ts", root), "utf8"),
    readFile(new URL("app/api/orders/[id]/action/route.ts", root), "utf8"),
    readFile(new URL("app/api/cash-movements/route.ts", root), "utf8"),
    readFile(new URL("app/api/cash-movements/[id]/action/route.ts", root), "utf8"),
    readFile(new URL("app/api/investor/route.ts", root), "utf8"),
  ]);
  assert.match(migration, /content_hash/);
  assert.match(migration, /supersedes_batch_id/);
  assert.match(migration, /business_day_controls_status_check/);
  assert.match(schema, /model BusinessDayControl/);
  assert.match(closeRoute, /BUSINESS_DAY_CLOSED/);
  assert.match(closeRoute, /BUSINESS_DAY_REOPENED/);
  assert.match(closeRoute, /closer cannot authorize reopening/i);
  assert.match(resolveRoute, /business day is closed/i);
  assert.match(signoffRoute, /business day is closed/i);
  assert.match(orderRoute, /assertBusinessDayOpen/);
  assert.match(orderActionRoute, /assertBusinessDayOpen/);
  assert.match(cashRoute, /assertBusinessDayOpen/);
  assert.match(cashActionRoute, /assertBusinessDayOpen/);
  assert.equal(investorRoute.match(/await assertBusinessDayOpen\(prisma, brokerId\)/g)?.length, 2);
});
