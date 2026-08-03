import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ADVISORY_PERMISSIONS, hasPermission } from "../lib/frank.ts";
import { MODULE_ENTITLEMENT, PROFILE_ROLES } from "../lib/tenant-capabilities.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("tenant capability matrix requires regulatory basis and profile-specific roles", () => {
  assert.equal(MODULE_ENTITLEMENT.dealer_operations, "securities_dealing");
  assert.equal(MODULE_ENTITLEMENT.issuer_advisory, "transaction_advisory");
  assert.ok(PROFILE_ROLES.investment_bank.includes("advisory_lead"));
  assert.ok(PROFILE_ROLES.securities_investment_adviser.includes("advisory_analyst"));
  assert.ok(!PROFILE_ROLES.securities_investment_adviser.includes("trader"));
  assert.ok(hasPermission("advisory_lead", ADVISORY_PERMISSIONS.checklistApprove));
  assert.ok(hasPermission("advisory_analyst", ADVISORY_PERMISSIONS.checklistPrepare));
  assert.ok(!hasPermission("advisory_analyst", ADVISORY_PERMISSIONS.checklistApprove));
  assert.ok(hasPermission("management", ADVISORY_PERMISSIONS.view));
});

test("schema and migration are additive, normalized, and tenant scoped", async () => {
  const [schema, migration] = await Promise.all([
    read("prisma/schema.prisma"),
    read("prisma/migrations/20260803120000_dealer_issuer_advisory_core/migration.sql"),
  ]);
  for (const model of ["TenantProfile", "TenantLicense", "TenantEntitlement", "TenantModule", "ChecklistTemplate", "Issuer", "AdvisoryDeal", "DealChecklistItem", "DealDocument", "DealTask", "DealSubmission", "RegulatoryQuery"]) assert.match(schema, new RegExp(`model ${model} \\{`));
  for (const table of ["tenant_profiles", "tenant_modules", "checklist_templates", "issuers", "advisory_deals", "deal_checklist_items", "deal_documents", "deal_tasks", "deal_submissions", "regulatory_queries"]) assert.ok(migration.includes(`CREATE TABLE "${table}"`));
  assert.match(schema, /tenantId\s+String\s+@map\("tenant_id"\)/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER COLUMN/);
});

test("advisory services enforce tenant scope, immutable checklist snapshots, stage reasons, and maker-checker", async () => {
  const service = await read("lib/advisory-service.ts");
  assert.match(service, /where: \{ id, tenantId \}/);
  assert.match(service, /template\.template\.items\.map/);
  assert.match(service, /Provide an override reason while mandatory checklist items remain incomplete/);
  assert.match(service, /item\.preparedByUserId === actor\.id/);
  assert.match(service, /Maker-checker requires a different reviewer/);
  assert.match(service, /version: \{ increment: 1 \}/);
  assert.match(service, /notApplicableReason/);
});

test("advisory routes gate the module and permissions on the server", async () => {
  const files = await Promise.all([
    read("app/api/advisory/route.ts"),
    read("app/api/advisory/deals/[id]/route.ts"),
    read("app/api/advisory/checklist/[id]/route.ts"),
    read("app/api/advisory/documents/route.ts"),
    read("app/api/advisory/documents/[id]/download/route.ts"),
  ]);
  for (const source of files) assert.match(source, /requireTenantModule\(request, "issuer_advisory"/);
  assert.match(files[4], /document: \{ tenantId: actor\.brokerId \}/);
  assert.match(files[3], /MAX_BYTES/);
  assert.match(files[3], /dealDocumentContent\.create/);
});

test("portal and admin render module-aware navigation, real tenant switching, roles, and Ethiopian packs", async () => {
  const [foundation, app, advisory, admin, seed] = await Promise.all([
    read("features/broker/shared/broker-foundation.tsx"),
    read("app/frankbroker-app.tsx"),
    read("features/broker/advisory/advisory-workspace.tsx"),
    read("app/admin/admin-console.tsx"),
    read("prisma/seed.ts"),
  ]);
  assert.match(foundation, /module\?: keyof TenantModules/);
  assert.match(foundation, /Advisory pipeline/);
  assert.match(app, /DEMO TENANT/);
  assert.match(app, /availableRoles\.map/);
  assert.match(app, /setDemoBrokerTenantId/);
  assert.match(advisory, /Regulation-derived checklist/);
  assert.match(advisory, /Professional validation is required/);
  assert.match(admin, /Identity & licensing/);
  assert.match(admin, /Checklist packs/);
  assert.match(seed, /ETH-IPO-MAIN/);
  assert.match(seed, /ETH-IPO-GROWTH/);
  assert.match(seed, /ETH-OTC-ADMISSION/);
});
