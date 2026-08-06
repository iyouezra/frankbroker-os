import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.ts";
import { ADVISORY_PERMISSIONS } from "../lib/frank.ts";
import { actOnChecklistItem, advanceDealStage, createDeal, getAdvisoryDeal } from "../lib/advisory-service.ts";
import { requireTenantModule, resolveTenantContext } from "../lib/tenant-capabilities.ts";
import { GET as getOrders } from "../app/api/orders/route.ts";
import { GET as getMarket } from "../app/api/market/route.ts";
import { GET as getCash } from "../app/api/cash-movements/route.ts";
import { GET as getReconciliation } from "../app/api/reconciliation/route.ts";
import { GET as getAdvisory } from "../app/api/advisory/route.ts";
import { GET as downloadDocument } from "../app/api/advisory/documents/[id]/download/route.ts";
import { POST as uploadDocument } from "../app/api/advisory/documents/route.ts";
import { resolveActor } from "../lib/server-auth.ts";

const profile = ({ id, businessType, entitlements, modules }) => ({
  id,
  name: id,
  licenseNumber: `${id}-LICENCE`,
  settings: { tradingName: id },
  tenantProfile: { businessType },
  tenantLicenses: [{ id: `lic_${id}`, regulator: "ECMA", licenseType: businessType, licenseNumber: `${id}-LICENCE`, status: "active", validFrom: new Date("2025-01-01T00:00:00.000Z"), validTo: null, createdAt: new Date("2025-01-01T00:00:00.000Z") }],
  tenantEntitlements: entitlements.map((activityKey) => ({ activityKey, status: "active" })),
  tenantModules: Object.entries(modules).map(([moduleKey, enabled]) => ({ moduleKey, enabled })),
  tenantChecklistPacks: [],
});

const tenants = {
  brk_abyssinia: profile({
    id: "brk_abyssinia",
    businessType: "securities_dealer",
    entitlements: ["securities_dealing"],
    modules: { dealer_operations: true, investor_servicing: true, issuer_advisory: false },
  }),
  brk_blue_nile: profile({
    id: "brk_blue_nile",
    businessType: "investment_bank",
    entitlements: ["securities_dealing", "transaction_advisory"],
    modules: { dealer_operations: true, investor_servicing: true, issuer_advisory: true },
  }),
  brk_sheba: profile({
    id: "brk_sheba",
    businessType: "securities_investment_adviser",
    entitlements: ["transaction_advisory"],
    modules: { dealer_operations: false, investor_servicing: false, issuer_advisory: true },
  }),
};

const request = (tenantId, role, path = "/api/advisory") => new Request(`http://localhost${path}`, {
  headers: { "x-frank-tenant-id": tenantId, "x-frank-demo-role": role },
});

const responseWithStatus = (status) => (error) => error instanceof Response && error.status === status;

function stub(t, object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  t.after(() => { object[method] = original; });
}

function mockTenantLookup(t) {
  return stub(t, prisma.broker, "findUnique", async ({ where }) => tenants[where.id] ?? null);
}

test("the three demo tenants resolve the expected modules and available roles", async (t) => {
  mockTenantLookup(t);
  const dealer = await resolveTenantContext("brk_abyssinia");
  const bank = await resolveTenantContext("brk_blue_nile");
  const adviser = await resolveTenantContext("brk_sheba");

  assert.deepEqual(dealer.modules, { dealer_operations: true, investor_servicing: true, issuer_advisory: false });
  assert.equal(dealer.availableRoles.includes("advisory_lead"), false);
  assert.deepEqual(bank.modules, { dealer_operations: true, investor_servicing: true, issuer_advisory: true });
  assert.equal(bank.availableRoles.includes("trader"), true);
  assert.equal(bank.availableRoles.includes("advisory_lead"), true);
  assert.deepEqual(adviser.modules, { dealer_operations: false, investor_servicing: false, issuer_advisory: true });
  assert.equal(adviser.availableRoles.includes("trader"), false);
  assert.equal(adviser.availableRoles.includes("advisory_analyst"), true);
});

test("demo actors resolve to users belonging to the selected tenant", async () => {
  const addisLead = await resolveActor(request("brk_blue_nile", "advisory_lead"));
  const addisAdmin = await resolveActor(request("brk_blue_nile", "broker_admin"));
  const shebaLead = await resolveActor(request("brk_sheba", "advisory_lead"));

  assert.equal(addisLead.id, "usr_advisory_lead");
  assert.equal(addisAdmin.id, "usr_blue_tenant_admin");
  assert.equal(shebaLead.id, "usr_sheba_advisory_lead");
  assert.equal(shebaLead.brokerId, "brk_sheba");
});

test("module access requires entitlement, an enabled module, an available role, and permission", async (t) => {
  const noEntitlement = profile({ id: "no_entitlement", businessType: "investment_bank", entitlements: [], modules: { issuer_advisory: true } });
  const noModule = profile({ id: "no_module", businessType: "investment_bank", entitlements: ["transaction_advisory"], modules: { issuer_advisory: false } });
  const adviserWithDealerModule = profile({ id: "adviser_with_dealer", businessType: "securities_investment_adviser", entitlements: ["securities_dealing"], modules: { dealer_operations: true } });
  stub(t, prisma.broker, "findUnique", async ({ where }) => ({ ...tenants, no_entitlement: noEntitlement, no_module: noModule, adviser_with_dealer: adviserWithDealerModule })[where.id] ?? null);

  assert.equal((await requireTenantModule(request("brk_blue_nile", "advisory_lead"), "issuer_advisory", ADVISORY_PERMISSIONS.checklistApprove)).actor.role, "advisory_lead");
  assert.equal((await requireTenantModule(request("brk_sheba", "advisory_analyst"), "issuer_advisory", ADVISORY_PERMISSIONS.checklistPrepare)).actor.role, "advisory_analyst");
  assert.equal((await requireTenantModule(request("brk_sheba", "management"), "issuer_advisory", ADVISORY_PERMISSIONS.view)).actor.role, "management");
  await assert.rejects(() => requireTenantModule(request("brk_abyssinia", "broker_admin"), "issuer_advisory", ADVISORY_PERMISSIONS.view), responseWithStatus(403));
  await assert.rejects(() => requireTenantModule(request("no_entitlement", "advisory_lead"), "issuer_advisory", ADVISORY_PERMISSIONS.view), responseWithStatus(403));
  await assert.rejects(() => requireTenantModule(request("no_module", "advisory_lead"), "issuer_advisory", ADVISORY_PERMISSIONS.view), responseWithStatus(403));
  await assert.rejects(() => requireTenantModule(request("adviser_with_dealer", "trader"), "dealer_operations", "report"), responseWithStatus(403));
  await assert.rejects(() => requireTenantModule(request("brk_sheba", "advisory_analyst"), "issuer_advisory", ADVISORY_PERMISSIONS.checklistApprove), responseWithStatus(403));
  await assert.rejects(() => requireTenantModule(request("brk_sheba", "management"), "issuer_advisory", ADVISORY_PERMISSIONS.dealManage), responseWithStatus(403));
  await assert.rejects(() => requireTenantModule(request("brk_sheba", "compliance"), "issuer_advisory", ADVISORY_PERMISSIONS.dealManage), responseWithStatus(403));
});

test("dealer tenants are rejected by advisory APIs before advisory queries run", async (t) => {
  mockTenantLookup(t);
  let advisoryQueryRan = false;
  stub(t, prisma.advisoryDeal, "findMany", async () => { advisoryQueryRan = true; return []; });
  const response = await getAdvisory(request("brk_abyssinia", "broker_admin", "/api/advisory"));
  assert.equal(response.status, 403);
  assert.equal(advisoryQueryRan, false);
});

test("adviser-only tenants are rejected by dealer-operation APIs before operational queries run", async (t) => {
  mockTenantLookup(t);
  let operationalQueryRan = false;
  stub(t, prisma.order, "count", async () => { operationalQueryRan = true; return 0; });
  stub(t, prisma.pooledBankAccount, "findMany", async () => { operationalQueryRan = true; return []; });
  stub(t, prisma.reconciliationBatch, "findMany", async () => { operationalQueryRan = true; return []; });
  stub(t, prisma.brokerInstrument, "findMany", async () => { operationalQueryRan = true; return []; });

  const responses = await Promise.all([
    getOrders(request("brk_sheba", "broker_admin", "/api/orders")),
    getMarket(request("brk_sheba", "broker_admin", "/api/market")),
    getCash(request("brk_sheba", "broker_admin", "/api/cash-movements")),
    getReconciliation(request("brk_sheba", "compliance", "/api/reconciliation")),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [403, 403, 403, 403]);
  assert.equal(operationalQueryRan, false);
});

test("cross-tenant advisory identifiers are indistinguishable from missing records", async (t) => {
  let receivedWhere;
  stub(t, prisma.advisoryDeal, "findFirst", async ({ where }) => {
    receivedWhere = where;
    return where.id === "deal_sheba" && where.tenantId === "brk_sheba" ? { id: "deal_sheba" } : null;
  });
  await assert.rejects(() => getAdvisoryDeal("brk_blue_nile", "deal_sheba"), responseWithStatus(404));
  assert.deepEqual(receivedWhere, { id: "deal_sheba", tenantId: "brk_blue_nile" });
});

test("maker-checker, reasons, stale versions, and approved-evidence reopening are enforced", async (t) => {
  let item = {
    id: "check_1", tenantId: "brk_blue_nile", dealId: "deal_1", title: "Corporate approval", status: "pending_approval",
    notes: "Board resolution uploaded", preparedByUserId: "usr_advisory_analyst", version: 3, deal: { id: "deal_1" },
  };
  let updateData;
  stub(t, prisma.dealChecklistItem, "findFirst", async ({ where }) => where.id === item.id && where.tenantId === item.tenantId ? item : null);
  stub(t, prisma, "$transaction", async (callback) => callback({
    dealChecklistItem: { update: async ({ data }) => { updateData = data; return { ...item, ...data, version: item.version + 1 }; } },
    auditLog: { create: async () => ({}) },
  }));

  const analyst = { id: "usr_advisory_analyst", email: "analyst@example.et", role: "advisory_analyst", brokerId: "brk_blue_nile" };
  const lead = { id: "usr_advisory_lead", email: "lead@example.et", role: "advisory_lead", brokerId: "brk_blue_nile" };
  await assert.rejects(() => actOnChecklistItem(analyst, item.id, { action: "approve", version: 3 }), responseWithStatus(409));
  await assert.rejects(() => actOnChecklistItem(lead, item.id, { action: "return", version: 3 }), responseWithStatus(400));
  await assert.rejects(() => actOnChecklistItem(lead, item.id, { action: "approve", version: 2 }), responseWithStatus(409));

  const approved = await actOnChecklistItem(lead, item.id, { action: "approve", version: 3, note: "Validated" });
  assert.equal(approved.status, "satisfied");
  assert.equal(updateData.reviewedByUserId, lead.id);

  item = { ...item, status: "satisfied", reviewedByUserId: lead.id, reviewedAt: new Date(), reviewNote: "Validated", version: 4 };
  await actOnChecklistItem(analyst, item.id, { action: "save", version: 4, note: "Evidence version replaced" });
  assert.equal(updateData.status, "in_progress");
  assert.equal(updateData.reviewedByUserId, null);
  assert.equal(updateData.reviewedAt, null);
  assert.equal(updateData.reviewNote, null);

  item = { ...item, status: "pending_approval", preparedByUserId: analyst.id, version: 5 };
  await actOnChecklistItem(lead, item.id, { action: "not_applicable", version: 5, note: "Requirement does not apply to this issuer" });
  assert.equal(updateData.status, "not_applicable");
  assert.equal(updateData.notApplicableReason, "Requirement does not apply to this issuer");
});

test("deal creation snapshots the compatible enabled checklist version", async (t) => {
  const templateItem = { id: "tpl_item_1", itemCode: "ELIG-01", section: "Eligibility", title: "Original published requirement", guidance: "Validate eligibility", expectedEvidence: "Signed evidence", required: true, sortOrder: 1, sourceTitle: "ECMA Directive", sourceUrl: "https://ecma.gov.et", sourceReference: "Rule 1" };
  const template = { id: "tpl_ipo_main_v1", code: "ETH-IPO-MAIN", version: "1.0", transactionType: "ipo", marketSegment: "main", items: [templateItem] };
  let packWhere;
  let snapshot;
  stub(t, prisma.tenantChecklistPack, "findFirst", async ({ where }) => { packWhere = where; return { template }; });
  stub(t, prisma.issuer, "findFirst", async ({ where }) => where.id === "issuer_1" && where.tenantId === "brk_blue_nile" ? { id: "issuer_1" } : null);
  stub(t, prisma, "$transaction", async (callback) => callback({
    advisoryDeal: { create: async ({ data }) => ({ ...data, id: "deal_new" }) },
    dealChecklistItem: { createMany: async ({ data }) => { snapshot = structuredClone(data); return { count: data.length }; } },
    auditLog: { create: async () => ({}) },
  }));

  const actor = { id: "usr_advisory_lead", email: "lead@example.et", role: "advisory_lead", brokerId: "brk_blue_nile" };
  const deal = await createDeal(actor, { issuerId: "issuer_1", name: "Issuer IPO", transactionType: "ipo", marketSegment: "main" });
  assert.equal(deal.checklistTemplateId, "tpl_ipo_main_v1");
  assert.deepEqual(packWhere.template, { transactionType: "ipo", marketSegment: "main", status: "published" });
  assert.equal(snapshot[0].title, "Original published requirement");
  templateItem.title = "A later template revision";
  assert.equal(snapshot[0].title, "Original published requirement");
});

test("incomplete stage changes require an audited override reason and remain tenant scoped", async (t) => {
  const deal = { id: "deal_1", tenantId: "brk_blue_nile", name: "Issuer IPO", stage: "readiness", checklistItems: [{ required: true, status: "in_progress" }] };
  let receivedWhere;
  let updateData;
  let auditData;
  stub(t, prisma.advisoryDeal, "findFirst", async ({ where }) => { receivedWhere = where; return where.id === deal.id && where.tenantId === deal.tenantId ? deal : null; });
  stub(t, prisma, "$transaction", async (callback) => callback({
    advisoryDeal: { update: async ({ data }) => { updateData = data; return { ...deal, ...data }; } },
    auditLog: { create: async ({ data }) => { auditData = data; return data; } },
  }));
  const actor = { id: "usr_advisory_lead", email: "lead@example.et", role: "advisory_lead", brokerId: "brk_blue_nile" };

  await assert.rejects(() => advanceDealStage(actor, deal.id, { stage: "due_diligence" }), responseWithStatus(400));
  await advanceDealStage(actor, deal.id, { stage: "due_diligence", overrideReason: "Board evidence is scheduled for Friday" });
  assert.deepEqual(receivedWhere, { id: deal.id, tenantId: actor.brokerId });
  assert.equal(updateData.stageOverrideReason, "Board evidence is scheduled for Friday");
  assert.equal(auditData.reason, "Board evidence is scheduled for Friday");
});

test("document downloads are tenant scoped and invalid uploads are rejected before storage", async (t) => {
  mockTenantLookup(t);
  stub(t, prisma.dealDocumentVersion, "findFirst", async ({ where }) => where.id === "version_sheba" && where.document.tenantId === "brk_sheba" ? {
    id: "version_sheba", mimeType: "application/pdf", originalName: "evidence.pdf", content: { bytes: new Uint8Array([37, 80, 68, 70]) },
  } : null);
  stub(t, prisma.advisoryDeal, "findFirst", async ({ where }) => where.id === "deal_blue" && where.tenantId === "brk_blue_nile" ? { id: "deal_blue" } : null);

  const crossTenant = await downloadDocument(request("brk_blue_nile", "advisory_analyst", "/api/advisory/documents/version_sheba/download"), { params: Promise.resolve({ id: "version_sheba" }) });
  assert.equal(crossTenant.status, 404);
  const ownTenant = await downloadDocument(request("brk_sheba", "advisory_analyst", "/api/advisory/documents/version_sheba/download"), { params: Promise.resolve({ id: "version_sheba" }) });
  assert.equal(ownTenant.status, 200);
  assert.equal(ownTenant.headers.get("cache-control"), "private, no-store");

  const form = new FormData();
  form.set("dealId", "deal_blue");
  form.set("title", "Executable evidence");
  form.set("file", new File(["unsafe"], "unsafe.exe", { type: "application/x-msdownload" }));
  const invalidUpload = await uploadDocument(new Request("http://localhost/api/advisory/documents", { method: "POST", headers: { "x-frank-tenant-id": "brk_blue_nile", "x-frank-demo-role": "advisory_analyst" }, body: form }));
  assert.equal(invalidUpload.status, 400);
});
