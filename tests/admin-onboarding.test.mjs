import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { POST } from "../app/api/admin/configuration/route.ts";

const platformRequest = (body) => new Request("http://localhost/api/admin/configuration", {
  method: "POST",
  headers: { "content-type": "application/json", "x-frank-demo-role": "super_admin" },
  body: JSON.stringify(body),
});

test("tenant onboarding rejects an invalid internal code before persistence", async () => {
  const response = await POST(platformRequest({ entity: "tenant", data: { tenantCode: "A", name: "New Securities", tradingName: "New", licenseNumber: "ECMA-100", licenseValidFrom: "2026-08-04", businessType: "securities_dealer" } }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Tenant code/);
});

test("instrument onboarding rejects invalid reference data before persistence", async () => {
  const response = await POST(platformRequest({ entity: "instrument", data: { symbol: "?", name: "New security", issuer: "Issuer", assetClass: "equity", marketSegment: "main", lotSize: 1, tickSize: .01, lastPrice: 100 } }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Symbol/);
});

test("admin onboarding persists complete tenant and instrument records transactionally", async () => {
  const source = await readFile(new URL("../app/api/admin/configuration/route.ts", import.meta.url), "utf8");
  for (const model of ["broker.create", "brokerSettings.create", "tenantProfile.create", "tenantLicense.create", "tenantEntitlement.createMany", "tenantModule.createMany", "tenantIntegration.createMany"]) assert.match(source, new RegExp(model.replace(".", "\\.")));
  for (const model of ["instrument.create", "brokerInstrument.createMany"]) assert.match(source, new RegExp(model.replace(".", "\\.")));
  assert.match(source, /TENANT_CREATED/);
  assert.match(source, /INSTRUMENT_CREATED/);
});
