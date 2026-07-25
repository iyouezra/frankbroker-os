import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { CRM_PERMISSIONS, hasPermission, roleLabels } from "../lib/frank.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [tasks, taskAction, cases, caseAction, assignments, taskService, caseService, assignmentService, clientRoute, investorRoute, schema, migration] = await Promise.all([
  read("../app/api/crm/tasks/route.ts"),
  read("../app/api/crm/tasks/[id]/action/route.ts"),
  read("../app/api/crm/cases/route.ts"),
  read("../app/api/crm/cases/[id]/action/route.ts"),
  read("../app/api/crm/assignments/route.ts"),
  read("../lib/crm/task-service.ts"),
  read("../lib/crm/case-service.ts"),
  read("../lib/crm/assignment-service.ts"),
  read("../app/api/clients/[id]/route.ts"),
  read("../app/api/investor/route.ts"),
  read("../prisma/schema.prisma"),
  read("../prisma/migrations/20260725150000_crm_tasks_cases_assignments/migration.sql"),
]);

/* --------------------------------------------------------- authorization --- */

test("every Phase 2 route gates on its own permission literal", () => {
  assert.match(tasks, /requirePermission\(request, CRM_PERMISSIONS\.taskView\)/);
  assert.match(tasks, /requirePermission\(request, CRM_PERMISSIONS\.taskCreate\)/);
  assert.match(taskAction, /requirePermission\(request, CRM_PERMISSIONS\.taskAssign\)/);
  assert.match(cases, /requirePermission\(request, CRM_PERMISSIONS\.caseView\)/);
  assert.match(cases, /requirePermission\(request, CRM_PERMISSIONS\.caseManage\)/);
  assert.match(caseAction, /requirePermission\(request, CRM_PERMISSIONS\.caseManage\)/);
  assert.match(assignments, /requirePermission\(request, CRM_PERMISSIONS\.relationshipAssign\)/);
});

test("completing a task needs a stronger right than progressing one", () => {
  // Anyone who can create work can move it along; only taskComplete may close it.
  assert.match(taskAction, /CRM_PERMISSIONS\.taskComplete\s*:\s*CRM_PERMISSIONS\.taskCreate/);
});

test("reading an assignment is separated from changing one", () => {
  const [get, post] = assignments.split("export async function POST");
  assert.match(get, /requirePermission\(request, CRM_PERMISSIONS\.view\)/);
  assert.doesNotMatch(get, /relationshipAssign/);
  assert.match(post, /relationshipAssign/);
});

test("only broker_admin, super_admin and service_officer can reassign an investor", () => {
  const holders = Object.keys(roleLabels).filter((role) => hasPermission(role, CRM_PERMISSIONS.relationshipAssign));
  assert.deepEqual(holders.sort(), ["broker_admin", "service_officer", "super_admin"]);
});

test("read-only roles cannot manage complaints or close tasks", () => {
  for (const role of ["management", "trader", "settlement"]) {
    assert.equal(hasPermission(role, CRM_PERMISSIONS.caseManage), false, `${role} must not manage cases`);
    assert.equal(hasPermission(role, CRM_PERMISSIONS.taskComplete), false, `${role} must not complete tasks`);
  }
  // But they can still see what is outstanding.
  assert.equal(hasPermission("management", CRM_PERMISSIONS.taskView), true);
  assert.equal(hasPermission("management", CRM_PERMISSIONS.caseView), true);
});

test("no Phase 2 route trusts a broker id from the browser", () => {
  for (const [name, source] of [["tasks", tasks], ["taskAction", taskAction], ["cases", cases], ["caseAction", caseAction], ["assignments", assignments]]) {
    assert.doesNotMatch(source, /payload\.brokerId|searchParams\.get\("brokerId"\)/, `${name} must derive the tenant from the actor`);
  }
});

/* -------------------------------------------------------------- services --- */

test("Phase 2 writes run serializably, like the order service", () => {
  for (const [name, source] of [["tasks", taskService], ["cases", caseService], ["assignments", assignmentService]]) {
    assert.match(source, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/, `${name} must serialize its writes`);
  }
});

test("every service scopes its reads and writes by brokerId", () => {
  for (const [name, source] of [["tasks", taskService], ["cases", caseService], ["assignments", assignmentService]]) {
    assert.match(source, /brokerId: actor\.brokerId|brokerId,/, `${name} must scope by tenant`);
  }
});

test("converting a thread to a case is idempotent", () => {
  // A double-click must not open two complaints for the same conversation.
  assert.match(caseService, /findUnique|findFirst/);
  assert.match(caseService, /threadId/);
  assert.match(schema, /threadId\s+String\?\s+@unique @map\("thread_id"\)/);
});

test("reassignment ends the previous record instead of overwriting it", () => {
  assert.match(assignmentService, /endedAt/);
  assert.match(assignmentService, /updateMany|update\(/);
  assert.match(assignmentService, /create\(/);
});

test("the investor only ever learns their officer's name and job title", () => {
  const officer = assignmentService.slice(assignmentService.indexOf("investorRelationshipOfficer"));
  assert.doesNotMatch(officer, /email|phone|\bid:\s*\w+\.id/);
  assert.match(officer, /fullName/);
  assert.match(officer, /role/);
});

/* ---------------------------------------------------------------- wiring --- */

test("Client 360 returns the servicing context the timeline needs", () => {
  for (const field of ["conversations:", "tasks:", "cases:", "relationship:"]) {
    assert.ok(clientRoute.includes(field), `${field} must be returned`);
  }
});

test("the investor bootstrap exposes the relationship officer", () => {
  assert.match(investorRoute, /relationshipOfficer: await investorRelationshipOfficer/);
});

/* ---------------------------------------------------------------- schema --- */

test("Phase 2 schema follows house conventions", () => {
  const phase2 = schema.slice(schema.indexOf("model CrmTask"));
  assert.doesNotMatch(phase2, /^enum /m, "no Prisma enums");
  assert.doesNotMatch(phase2, /@default\(cuid\(\)\)/, "ids are supplied by app code");
  for (const table of ["crm_tasks", "service_cases", "investor_assignments"]) {
    assert.ok(schema.includes(`@@map("${table}")`), `${table} must be mapped`);
  }
  // Optimistic concurrency on the two mutable records.
  assert.match(schema.slice(schema.indexOf("model CrmTask"), schema.indexOf("model ServiceCase")), /version\s+Int\s+@default\(0\)/);
});

test("the migration creates every Phase 2 table and its indexes", () => {
  for (const table of ["crm_tasks", "service_cases", "investor_assignments"]) {
    assert.ok(migration.includes(`CREATE TABLE "${table}"`), `${table} must be created`);
    assert.ok(migration.includes(`"${table}_pkey"`), `${table} needs a primary key constraint`);
  }
  assert.match(migration, /CREATE UNIQUE INDEX .*service_cases.*thread_id/);
  assert.match(migration, /ADD CONSTRAINT/);
  // Every task index the query planner relies on.
  assert.ok(migration.includes("crm_tasks_broker_id_status_due_date_idx"));
  assert.ok(migration.includes("crm_tasks_broker_id_assigned_to_user_id_status_idx"));
});

/* ----------------------------------------------------------------- scope --- */

test("no sales-CRM vocabulary entered the servicing layer", () => {
  const forbidden = /\b(lead|prospect|pipeline|campaign|opportunity|quota|commission|upsell|forecast)\b/i;
  for (const [name, source] of [["tasks", taskService], ["cases", caseService], ["assignments", assignmentService], ["tasksRoute", tasks], ["casesRoute", cases]]) {
    assert.doesNotMatch(source, forbidden, `${name} must stay investor servicing, not sales`);
  }
});
