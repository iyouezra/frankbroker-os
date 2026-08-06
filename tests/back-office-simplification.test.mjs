import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { sortWorkItems } from "../lib/back-office.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [schema, migration, workRoute, searchRoute, workService, routing, requestService, threadAction, threadService, brokerApp, dashboard, clientScreen] = await Promise.all([
  read("../prisma/schema.prisma"),
  read("../prisma/migrations/20260727120000_back_office_workflow_simplification/migration.sql"),
  read("../app/api/work-items/route.ts"),
  read("../app/api/search/route.ts"),
  read("../lib/back-office-service.ts"),
  read("../lib/crm/routing-service.ts"),
  read("../lib/crm/service-request-service.ts"),
  read("../app/api/crm/threads/[id]/action/route.ts"),
  read("../lib/crm/thread-service.ts"),
  read("../app/frankbroker-app.tsx"),
  read("../features/broker/dashboard/dashboard-screen.tsx"),
  read("../features/broker/clients/client-directory-screen.tsx"),
]);

test("work items sort critical and dated work before normal recent work", () => {
  const base = { title: "", detail: "", status: "open", ownerId: null, ownerName: null, readOnly: false, target: { view: "crm_tasks", entityType: "crm_task", entityId: "x" } };
  const rows = [
    { ...base, id: "normal", kind: "task", urgency: "normal", dueAt: null, createdAt: "2026-07-27T10:00:00Z" },
    { ...base, id: "high", kind: "task", urgency: "high", dueAt: "2026-07-29", createdAt: "2026-07-27T08:00:00Z" },
    { ...base, id: "critical", kind: "case", urgency: "critical", dueAt: "2026-07-26", createdAt: "2026-07-26T08:00:00Z" },
  ];
  assert.deepEqual(rows.sort(sortWorkItems).map((row) => row.id), ["critical", "high", "normal"]);
});

test("service requests have a durable unique conversation link and a backfill", () => {
  assert.match(schema, /threadId\s+String\?\s+@unique @map\("thread_id"\)/);
  assert.match(schema, /serviceRequest\s+ClientServiceRequest\?/);
  assert.match(migration, /related_type" = 'service_request'/);
  assert.match(migration, /client_service_requests_thread_id_key/);
});

test("request completion is one serializable transaction with outcome, audit, notification, and closure checks", () => {
  assert.match(requestService, /Serializable/);
  assert.match(requestService, /activeOrders/);
  assert.match(requestService, /appendMessage/);
  assert.match(requestService, /status: "resolved"/);
  assert.match(requestService, /writeAudit/);
  assert.match(requestService, /writeNotification/);
  assert.match(threadAction, /action === "service_request"/);
  assert.match(threadAction, /requirePermission\(request, "adjust"\)/);
});

test("hybrid routing uses specialist, relationship, least-load, inheritance, and audit paths", () => {
  assert.match(routing, /\["cash", "kyc", "complaint"\]/);
  assert.match(routing, /relationship_officer/);
  assert.match(routing, /least_loaded_eligible/);
  assert.match(routing, /case_owner/);
  assert.match(routing, /conversation_owner/);
  assert.match(routing, /serviceCase\.groupBy/);
  assert.match(threadService, /routeInvestorConversation/);
  assert.match(threadService, /auditAutomaticRouting/);
});

test("work and search endpoints derive tenant and role from an authorized actor", () => {
  assert.match(workRoute, /requirePermission\(request, "report"\)/);
  assert.match(searchRoute, /requirePermission\(request, "report"\)/);
  assert.doesNotMatch(workRoute + searchRoute, /searchParams\.get\("brokerId"\)|payload\.brokerId/);
  for (const model of ["order", "client", "cashMovement", "settlement", "reconciliationException", "communicationThread", "crmTask", "serviceCase", "clientServiceRequest"]) {
    assert.ok(workService.includes(`prisma.${model}`), `work service should include ${model}`);
  }
});

test("dashboard, command search, notifications, and related records share typed target navigation", () => {
  assert.match(dashboard, /MY WORK/);
  assert.match(brokerApp, /navigateToTarget/);
  assert.match(brokerApp, /UniversalSearch/);
  assert.match(brokerApp, /onOpenWork/);
  assert.match(brokerApp, /openNotification/);
  assert.match(clientScreen, /Open conversation/);
  assert.doesNotMatch(clientScreen, />Approve closure</);
});
