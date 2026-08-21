import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Prisma } from "../app/generated/prisma/client.ts";
import { allocateTaxLots } from "../lib/tax-lot-service.ts";

const D = (value) => new Prisma.Decimal(value);

test("FIFO allocations preserve proceeds, fees, cost, and rounding", () => {
  const rows = allocateTaxLots([
    { id: "opening", remainingQuantity: D(3), unitCost: D(10), basisStatus: "known" },
    { id: "later", remainingQuantity: D(4), unitCost: D(12), basisStatus: "known" },
  ], D(5), D("100.01"), D("2.03"));
  assert.deepEqual(rows.map((item) => [item.lotId, item.quantity.toString()]), [["opening", "3"], ["later", "2"]]);
  assert.equal(rows.reduce((sum, item) => sum.plus(item.grossProceeds), D(0)).toString(), "100.01");
  assert.equal(rows.reduce((sum, item) => sum.plus(item.allocatedFees), D(0)).toString(), "2.03");
  assert.equal(rows[0].costBasis.toString(), "30");
  assert.equal(rows[1].costBasis.toString(), "24");
});

test("unknown basis stays unknown and never becomes zero", () => {
  const [row] = allocateTaxLots([{ id: "demat", remainingQuantity: D(10), unitCost: null, basisStatus: "unknown" }], D(4), D(80), D(1));
  assert.equal(row.costBasis, null);
  assert.equal(row.realizedGain, null);
  assert.equal(row.basisStatus, "unknown");
});

test("servicing implementation preserves evidence, independent approval, and retrospective revisions", async () => {
  const root = new URL("../", import.meta.url);
  const [schema, migration, corporate, tax, settlement, investor, brokerUi] = await Promise.all([
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
    readFile(new URL("prisma/migrations/20260821140000_corporate_actions_tax_lots/migration.sql", root), "utf8"),
    readFile(new URL("lib/corporate-action-service.ts", root), "utf8"),
    readFile(new URL("lib/tax-reporting-service.ts", root), "utf8"),
    readFile(new URL("lib/oms/settlement-service.ts", root), "utf8"),
    readFile(new URL("app/api/investor/route.ts", root), "utf8"),
    readFile(new URL("features/broker/operations/asset-servicing-screen.tsx", root), "utf8"),
  ]);
  for (const model of ["CorporateAction", "CorporateActionEntitlement", "TaxPolicyVersion", "TaxLot", "RealizedGainAllocation", "TaxCalculation"]) assert.match(schema, new RegExp(`model ${model}`));
  assert.match(migration, /dematerialized_opening/);
  assert.match(migration, /cost_basis.*DECIMAL.*\)/s);
  assert.match(corporate, /Four-eyes control/);
  assert.match(corporate, /position file contains.*absent from the internal snapshot/i);
  assert.match(corporate, /basisStatus: "unknown"/);
  assert.match(tax, /retrospectiveFrom/);
  assert.match(tax, /supersedesId/);
  assert.match(tax, /including for a 0% policy/);
  assert.match(settlement, /recordSettledBuyTaxLot/);
  assert.match(settlement, /recordSettledSaleRealizations/);
  assert.match(investor, /dispositionsNeedingBasis/);
  assert.match(brokerUi, /Tax figures shown here|tax remains an estimate/i);
});
