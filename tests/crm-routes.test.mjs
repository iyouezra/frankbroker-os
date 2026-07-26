import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [threads, threadDetail, threadAction, brokerAttachment, investorSupport, investorAttachment, investorRoute, service, api, persistence, notifications, schema, migration] = await Promise.all([
  read("../app/api/crm/threads/route.ts"),
  read("../app/api/crm/threads/[id]/route.ts"),
  read("../app/api/crm/threads/[id]/action/route.ts"),
  read("../app/api/crm/attachments/[id]/route.ts"),
  read("../app/api/investor/support/route.ts"),
  read("../app/api/investor/support/attachments/[id]/route.ts"),
  read("../app/api/investor/route.ts"),
  read("../lib/crm/thread-service.ts"),
  read("../lib/api.ts"),
  read("../lib/oms/persistence.ts"),
  read("../lib/oms/notification-service.ts"),
  read("../prisma/schema.prisma"),
  read("../prisma/migrations/20260725120000_crm_communication_threads/migration.sql"),
]);

test("broker CRM routes gate every action behind its own permission", () => {
  assert.match(threads, /requirePermission\(request, CRM_PERMISSIONS\.view\)/);
  assert.match(threads, /requirePermission\(request, CRM_PERMISSIONS\.create\)/);
  assert.match(threadDetail, /requirePermission\(request, CRM_PERMISSIONS\.view\)/);
  for (const permission of ["reply", "note", "assign", "status", "priority", "view"]) {
    assert.match(threadAction, new RegExp(`requirePermission\\(request, CRM_PERMISSIONS\\.${permission}\\)`), `${permission} must be gated`);
  }
  assert.match(brokerAttachment, /requirePermission\(request, CRM_PERMISSIONS\.view\)/);
});

test("broker list route paginates and scopes with the shared helpers", () => {
  assert.match(threads, /boundedInteger/);
  assert.match(service, /skip: \(query\.page - 1\) \* query\.pageSize/);
  assert.match(service, /take: query\.pageSize/);
  assert.match(service, /pagination: \{/);
  assert.match(threads, /multipart\/form-data/);
});

test("investor routes authorize by ownership and never use the broker permission gate", () => {
  for (const [name, source] of [["support read", investorSupport], ["support attachment", investorAttachment]]) {
    assert.match(source, /resolveInvestorContext\(/, `${name} must resolve the investor context`);
    // Match a call specifically - the file's own comments mention the gate by name.
    assert.doesNotMatch(source, /requirePermission\(/, `${name} must never call the broker permission gate`);
  }
  assert.match(investorAttachment, /getAttachmentForInvestor/);
  assert.match(brokerAttachment, /getAttachmentForBroker/);
});

test("attachment downloads are private, non-sniffable, and header-injection safe", async () => {
  // Both portals share one response builder, so the hardening lives in one place.
  const attachments = await read("../lib/crm/attachments.ts");
  assert.match(attachments, /cache-control": "private, no-store/);
  assert.match(attachments, /x-content-type-options": "nosniff/);
  assert.match(attachments, /sanitizeAttachmentName\(attachment\.originalName\)/);
  assert.match(investorAttachment, /attachmentResponse\(/);
  assert.match(brokerAttachment, /attachmentResponse\(/);
});

test("investor write actions are dispatched and the existing service-request rules survive", () => {
  assert.match(investorRoute, /support_thread_create/);
  assert.match(investorRoute, /support_thread_reply/);
  assert.match(investorRoute, /support_thread_read/);
  assert.match(investorRoute, /openThreadForServiceRequest\(tx,/, "the linked thread must commit with the request");
  // Regression guards: the untouched service-request branch must still be intact.
  assert.match(investorRoute, /discrepancyWindowDays/);
  assert.match(investorRoute, /A matching request is already being reviewed/);
  assert.match(investorRoute, /closureRequestedAt/);
});

test("the service layer is transactional, audited, and locks the thread it mutates", () => {
  assert.match(service, /TransactionIsolationLevel\.Serializable/);
  assert.match(service, /lockThread\(/);
  assert.match(persistence, /export async function lockThread/);
  assert.match(persistence, /communication_threads/);
  for (const action of ["CRM_THREAD_CREATED", "CRM_MESSAGE_POSTED", "CRM_INTERNAL_NOTE_ADDED", "CRM_THREAD_ASSIGNED", "CRM_THREAD_STATUS_CHANGED", "CRM_THREAD_PRIORITY_CHANGED", "CRM_THREAD_REOPENED"]) {
    assert.match(service, new RegExp(action), `${action} must be audited`);
  }
  assert.match(service, /assertThreadTransition\(/);
  assert.match(service, /assertBrokerTenant\(/);
  assert.match(service, /assertInvestorOwns\(/);
});

test("adding an internal note cannot notify the investor", () => {
  const start = service.indexOf("export async function addInternalNote");
  assert.ok(start > -1, "addInternalNote must exist");
  const body = service.slice(start, service.indexOf("export async function", start + 1));
  assert.doesNotMatch(body, /writeNotification/, "an internal note must never send a notification");
  assert.match(body, /visibility: INTERNAL/);
  assert.match(body, /authorType: "system"/, "system authorship keeps the status unchanged");
  assert.match(body, /assertNoInvestorNotifyForInternal/);
});

test("investor reads exclude internal messages at the query level as well as the serializer", () => {
  const start = service.indexOf("export async function getInvestorThread");
  const body = service.slice(start, service.indexOf("export async function", start + 1));
  assert.match(body, /visibility: SHARED/, "the query itself must exclude internal notes");
  assert.match(body, /visibleMessagesFor\("investor"/);
  assert.match(body, /assertInvestorOwns/);
});

test("the thread transition error maps to 409 and support is a notification category", () => {
  assert.match(api, /InvalidThreadTransitionError/);
  assert.match(notifications, /\| "support"/);
  assert.match(notifications, /export const SERVICE/);
});

test("schema and migration follow the project conventions", () => {
  assert.match(schema, /model CommunicationThread/);
  assert.match(schema, /model CommunicationMessage/);
  assert.match(schema, /model CommunicationAttachment\b/);
  assert.match(schema, /model CommunicationAttachmentContent/);
  assert.match(schema, /@@index\(\[brokerId, status, lastMessageAt\]\)/);
  assert.match(schema, /@@index\(\[threadId, visibility, createdAt\]\)/);
  assert.match(schema, /@@map\("communication_threads"\)/);
  assert.doesNotMatch(schema, /enum ThreadStatus/, "the project stores status as String, not a Prisma enum");

  assert.match(migration, /communication_threads_pkey/);
  assert.match(migration, /communication_messages_pkey/);
  assert.match(migration, /communication_attachments_pkey/);
  assert.match(migration, /communication_attachment_contents_pkey/);
  assert.match(migration, /BYTEA/);
  assert.match(migration, /communication_messages_thread_id_visibility_created_at_idx/);
});
