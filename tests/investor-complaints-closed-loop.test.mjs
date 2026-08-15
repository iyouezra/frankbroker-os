import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("an investor complaint atomically opens one formal case from its conversation", async () => {
  const [threadService, complaintService] = await Promise.all([
    source("lib/crm/thread-service.ts"), source("lib/crm/complaint-service.ts"),
  ]);
  assert.match(threadService, /category === "complaint" \? await openComplaintCaseFromThread/);
  assert.match(complaintService, /findUnique\(\{ where: \{ threadId: input\.threadId \}/);
  assert.match(complaintService, /targetResolutionAt: targetResolutionDate/);
  assert.match(complaintService, /category: "complaint", priority:/);
  assert.match(complaintService, /CRM_CASE_OPENED/);
});

test("an order discrepancy becomes a complaint only when the investor explicitly asks", async () => {
  const [sheet, route] = await Promise.all([
    source("features/investor/profile/profile-workflow-sheets.tsx"), source("app/api/investor/route.ts"),
  ]);
  assert.match(sheet, /Treat this as a formal complaint/);
  assert.match(sheet, /formalComplaint/);
  assert.match(route, /formalComplaint = requestType === "trade_discrepancy" && payload\.formalComplaint === true/);
  assert.match(route, /category: formalComplaint \? "complaint"/);
  assert.match(route, /openComplaintCaseFromThread/);
});

test("broker information requests and resolutions are published to the investor conversation", async () => {
  const service = await source("lib/crm/case-service.ts");
  assert.match(service, /next === "awaiting_investor"/);
  assert.match(service, /authorType: "broker"[\s\S]*body: updateForInvestor/);
  assert.match(service, /Complaint resolution\\n\\n\$\{summary\}/);
  assert.match(service, /Complaint closure\\n\\n\$\{summary\}/);
  assert.match(service, /status: "resolved", resolvedAt: now/);
});

test("the investor can accept a resolution or reopen the complaint with a reason", async () => {
  const [service, route, screen] = await Promise.all([
    source("lib/crm/case-service.ts"), source("app/api/investor/complaints/route.ts"), source("features/investor/support/complaints-screen.tsx"),
  ]);
  assert.match(service, /accept_resolution/);
  assert.match(service, /CRM_CASE_RESOLUTION_ACCEPTED/);
  assert.match(service, /remain_dissatisfied/);
  assert.match(service, /CRM_CASE_REOPENED_BY_INVESTOR/);
  assert.match(route, /resolveInvestorContext\(request\)/);
  assert.match(screen, /I accept this resolution/);
  assert.match(screen, /I remain dissatisfied/);
  assert.doesNotMatch(screen, /internalFindings|regulatoryComment|assignedToUserId/);
});

test("formal complaints feed the existing ECMA complaint report without a new data model", async () => {
  const [reporting, schema] = await Promise.all([source("lib/compliance-service.ts"), source("prisma/schema.prisma")]);
  assert.match(reporting, /prisma\.serviceCase\.findMany/);
  assert.match(reporting, /category: "complaint"/);
  assert.equal((schema.match(/model ServiceCase \{/g) ?? []).length, 1);
});
