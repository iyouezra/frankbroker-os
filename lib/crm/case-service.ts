import { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "../prisma";
import type { Actor } from "../server-auth";
import { writeAudit } from "../oms/audit-service";
import { writeNotification, SERVICE } from "../oms/notification-service";
import { lockThread } from "../oms/persistence";
import { appendMessage } from "./thread-service";
import type { InvestorContextLike } from "./access";
import { assertBrokerTenant } from "./access";
import {
  CASE_STATUS_LABELS,
  OPEN_CASE_STATUSES,
  assertCaseTransition,
  isCaseOverdue,
  isCaseStatus,
  parseCaseCategory,
  parseFindings,
  parseResolutionSummary,
  parseSeverity,
  targetResolutionDate,
  type CaseStatus,
} from "./cases";

/**
 * Complaints and service cases. A case is always born from a conversation, so
 * the original communication history is preserved and linked rather than copied.
 */

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const newCaseId = () => `CASE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

const caseInclude = {
  client: { select: { id: true, clientCode: true, fullName: true } },
  assignedTo: { select: { id: true, fullName: true } },
  thread: { select: { id: true, subject: true, status: true } },
} satisfies Prisma.ServiceCaseInclude;

type CaseRow = Prisma.ServiceCaseGetPayload<{ include: typeof caseInclude }>;

export function serializeCase(row: CaseRow) {
  return {
    id: row.id,
    subject: row.subject,
    category: row.category,
    severity: row.severity,
    status: row.status,
    statusLabel: CASE_STATUS_LABELS[row.status as CaseStatus] ?? row.status,
    client: row.client ? { id: row.client.id, code: row.client.clientCode, name: row.client.fullName } : null,
    assignedToUserId: row.assignedToUserId,
    assignedToName: row.assignedTo?.fullName ?? null,
    threadId: row.threadId,
    threadSubject: row.thread?.subject ?? null,
    openedAt: row.openedAt.toISOString(),
    targetResolutionAt: row.targetResolutionAt ? row.targetResolutionAt.toISOString() : null,
    overdue: isCaseOverdue({ status: row.status, targetResolutionAt: row.targetResolutionAt }),
    internalFindings: row.internalFindings,
    resolutionSummary: row.resolutionSummary,
    regulatoryStatus: row.regulatoryStatus,
    regulatoryStatusAt: row.regulatoryStatusAt ? row.regulatoryStatusAt.toISOString() : null,
    regulatoryComment: row.regulatoryComment,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

export async function listCases(actor: Actor, query: { page: number; pageSize: number; status?: string; severity?: string; clientId?: string; query?: string }) {
  const where: Prisma.ServiceCaseWhereInput = { brokerId: actor.brokerId };
  if (query.status === "open_all") where.status = { in: OPEN_CASE_STATUSES };
  else if (query.status && isCaseStatus(query.status)) where.status = query.status;
  if (query.severity) where.severity = query.severity;
  if (query.clientId) where.clientId = query.clientId;
  const search = (query.query ?? "").trim().slice(0, 120);
  if (search) where.OR = [
    { id: { contains: search, mode: "insensitive" } },
    { subject: { contains: search, mode: "insensitive" } },
    { client: { fullName: { contains: search, mode: "insensitive" } } },
  ];

  const [rows, total, openCount] = await Promise.all([
    prisma.serviceCase.findMany({
      where,
      include: caseInclude,
      orderBy: [{ openedAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.serviceCase.count({ where }),
    prisma.serviceCase.count({ where: { brokerId: actor.brokerId, status: { in: OPEN_CASE_STATUSES } } }),
  ]);

  const serialized = rows.map(serializeCase);
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  return {
    cases: serialized,
    pagination: { page: Math.min(query.page, pageCount), pageSize: query.pageSize, total, pageCount },
    facets: { open: openCount, overdue: serialized.filter((row) => row.overdue).length },
  };
}

export async function getCase(actor: Actor, caseId: string) {
  const row = await prisma.serviceCase.findFirst({ where: { id: caseId, brokerId: actor.brokerId }, include: caseInclude });
  assertBrokerTenant(actor, row ? { brokerId: row.brokerId, clientId: row.clientId } : null);
  return serializeCase(row!);
}

/**
 * Converts a conversation into a formal case. The thread is left intact and
 * linked - its messages remain the case's communication history.
 */
export async function convertThreadToCase(actor: Actor, threadId: string, input: { severity?: unknown; category?: unknown; subject?: unknown }) {
  const severity = parseSeverity(input.severity);
  const category = parseCaseCategory(input.category);

  return prisma.$transaction(async (tx) => {
    await lockThread(tx, threadId);
    const thread = await tx.communicationThread.findFirst({
      where: { id: threadId, brokerId: actor.brokerId },
      include: { client: { select: { id: true, fullName: true } }, serviceCase: { select: { id: true } } },
    });
    assertBrokerTenant(actor, thread);
    if (thread.serviceCase) {
      // Idempotent: a thread maps to at most one case.
      return { id: thread.serviceCase.id, status: "existing" as const };
    }

    const openedAt = new Date();
    const id = newCaseId();
    const subject = String(input.subject ?? thread.subject).trim().slice(0, 160) || thread.subject;
    await tx.serviceCase.create({
      data: {
        id,
        brokerId: actor.brokerId,
        clientId: thread.clientId,
        threadId,
        subject,
        category,
        severity,
        status: "new",
        assignedToUserId: thread.assignedToUserId,
        openedAt,
        targetResolutionAt: targetResolutionDate(severity, openedAt),
      },
    });
    // Reflect the escalation on the conversation so the inbox shows it too.
    await tx.communicationThread.update({
      where: { id: threadId },
      data: { category: "complaint", priority: severity === "critical" ? "urgent" : "high", version: { increment: 1 } },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_CASE_OPENED",
      entityType: "service_case",
      entityId: id,
      summary: `Case ${id} opened from conversation ${threadId} for ${thread.client.fullName}`,
      newValue: { severity, category, threadId },
    });
    await writeNotification(tx, {
      scope: "broker",
      brokerId: actor.brokerId,
      roles: SERVICE,
      category: "support",
      severity: severity === "critical" || severity === "high" ? "critical" : "warning",
      title: "Complaint case opened",
      body: `${thread.client.fullName}: ${subject}`,
      entityType: "service_case",
      entityId: id,
    });
    return { id, status: "new" as const };
  }, transactionOptions);
}

async function loadCase(tx: Prisma.TransactionClient, actor: Actor, caseId: string) {
  const row = await tx.serviceCase.findFirst({
    where: { id: caseId, brokerId: actor.brokerId },
    include: { client: { select: { id: true, fullName: true } } },
  });
  assertBrokerTenant(actor, row ? { brokerId: row.brokerId, clientId: row.clientId } : null);
  return row!;
}

export async function changeCaseStatus(actor: Actor, caseId: string, next: string, resolutionSummary?: unknown, clientMessage?: unknown) {
  if (!isCaseStatus(next)) throw new Response("That case status is not supported.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    const row = await loadCase(tx, actor, caseId);
    assertCaseTransition(row.status, next);
    // Resolving requires a written outcome the investor could be shown.
    const summary = next === "resolved" || next === "closed" ? parseResolutionSummary(resolutionSummary) : row.resolutionSummary;
    const updateForInvestor = next === "awaiting_investor" ? String(clientMessage ?? "").trim() : "";
    if (next === "awaiting_investor" && (updateForInvestor.length < 10 || updateForInvestor.length > 4_000)) {
      throw new Response("Explain what information the investor needs to provide.", { status: 400 });
    }
    const now = new Date();

    await tx.serviceCase.update({
      where: { id: caseId },
      data: {
        status: next,
        resolutionSummary: summary,
        resolvedAt: next === "resolved" ? now : next === "closed" ? row.resolvedAt : null,
        closedAt: next === "closed" ? now : null,
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_CASE_STATUS_CHANGED",
      entityType: "service_case",
      entityId: caseId,
      summary: `Case ${caseId} moved to ${CASE_STATUS_LABELS[next]}`,
      previousValue: { status: row.status },
      newValue: { status: next, resolutionSummary: summary },
    });
    const thread = row.threadId ? await tx.communicationThread.findUnique({ where: { id: row.threadId } }) : null;
    if (thread && next === "awaiting_investor") {
      await appendMessage(tx, thread, { threadId: thread.id, visibility: "shared", authorType: "broker", authorUserId: actor.id, body: updateForInvestor, brokerId: actor.brokerId, clientId: row.clientId });
    }
    if (thread && next === "resolved") {
      await appendMessage(tx, thread, { threadId: thread.id, visibility: "shared", authorType: "broker", authorUserId: actor.id, body: `Complaint resolution\n\n${summary}`, brokerId: actor.brokerId, clientId: row.clientId });
      await tx.communicationThread.update({ where: { id: thread.id }, data: { status: "resolved", resolvedAt: now, version: { increment: 1 } } });
    }
    if (thread && next === "closed") {
      await appendMessage(tx, thread, { threadId: thread.id, visibility: "shared", authorType: "broker", authorUserId: actor.id, body: `Complaint closure\n\n${summary}`, brokerId: actor.brokerId, clientId: row.clientId });
      await tx.communicationThread.update({ where: { id: thread.id }, data: { status: "closed", closedAt: now, version: { increment: 1 } } });
    }
    if (next === "awaiting_investor" || next === "resolved" || next === "closed") {
      await writeNotification(tx, {
        scope: "investor",
        brokerId: actor.brokerId,
        clientId: row.clientId,
        category: "support",
        severity: next === "resolved" ? "success" : "info",
        title: next === "awaiting_investor" ? "Information needed for your complaint" : next === "resolved" ? "Your complaint was resolved" : "Your case was closed",
        body: row.subject,
        entityType: next === "awaiting_investor" && row.threadId ? "communication_thread" : "service_case",
        entityId: next === "awaiting_investor" && row.threadId ? row.threadId : caseId,
      });
    }
    return { status: next };
  }, transactionOptions);
}

const investorCaseInclude = { thread: { select: { id: true, subject: true, serviceRequest: { select: { orderId: true } } } } } satisfies Prisma.ServiceCaseInclude;

function serializeInvestorCase(row: Prisma.ServiceCaseGetPayload<{ include: typeof investorCaseInclude }>) {
  return {
    id: row.id, subject: row.subject, status: row.status,
    statusLabel: CASE_STATUS_LABELS[row.status as CaseStatus] ?? row.status,
    severity: row.severity, openedAt: row.openedAt.toISOString(),
    targetResolutionAt: row.targetResolutionAt?.toISOString() ?? null,
    resolutionSummary: row.resolutionSummary, resolvedAt: row.resolvedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null, threadId: row.threadId,
    orderId: row.thread?.serviceRequest?.orderId ?? null,
  };
}

export async function listInvestorComplaints(context: InvestorContextLike) {
  const rows = await prisma.serviceCase.findMany({
    where: { brokerId: context.brokerId, clientId: context.clientId, category: "complaint" },
    include: investorCaseInclude, orderBy: { openedAt: "desc" }, take: 50,
  });
  return rows.map(serializeInvestorCase);
}

export async function actOnInvestorComplaint(context: InvestorContextLike, caseId: string, input: { action: string; reason?: unknown }) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.serviceCase.findFirst({ where: { id: caseId, brokerId: context.brokerId, clientId: context.clientId, category: "complaint" }, include: investorCaseInclude });
    if (!row) throw new Response("Complaint not found.", { status: 404 });
    if (row.status !== "resolved") throw new Response("This complaint does not currently have a resolution to respond to.", { status: 409 });
    const now = new Date();
    const thread = row.threadId ? await tx.communicationThread.findUnique({ where: { id: row.threadId } }) : null;
    if (input.action === "accept_resolution") {
      await tx.serviceCase.update({ where: { id: row.id }, data: { status: "closed", closedAt: now, version: { increment: 1 } } });
      if (thread) {
        await appendMessage(tx, thread, { threadId: thread.id, visibility: "shared", authorType: "investor", authorUserId: null, body: "I accept this resolution.", brokerId: context.brokerId, clientId: context.clientId });
        await tx.communicationThread.update({ where: { id: thread.id }, data: { status: "closed", closedAt: now, version: { increment: 1 } } });
      }
      await writeAudit(tx, { brokerId: context.brokerId, actorId: null, action: "CRM_CASE_RESOLUTION_ACCEPTED", entityType: "service_case", entityId: row.id, summary: `Investor accepted the resolution for ${row.id}`, newValue: { status: "closed" } });
      await writeNotification(tx, { scope: "broker", brokerId: context.brokerId, roles: SERVICE, category: "support", severity: "success", title: "Complaint resolution accepted", body: row.subject, entityType: "service_case", entityId: row.id });
      return { complaint: serializeInvestorCase({ ...row, status: "closed", closedAt: now }) };
    }
    if (input.action === "remain_dissatisfied") {
      const reason = String(input.reason ?? "").trim();
      if (reason.length < 10 || reason.length > 4_000) throw new Response("Explain why you remain dissatisfied.", { status: 400 });
      await tx.serviceCase.update({ where: { id: row.id }, data: { status: "under_review", resolvedAt: null, closedAt: null, version: { increment: 1 } } });
      if (thread) await appendMessage(tx, thread, { threadId: thread.id, visibility: "shared", authorType: "investor", authorUserId: null, body: `I remain dissatisfied with the resolution.\n\n${reason}`, brokerId: context.brokerId, clientId: context.clientId });
      await writeAudit(tx, { brokerId: context.brokerId, actorId: null, action: "CRM_CASE_REOPENED_BY_INVESTOR", entityType: "service_case", entityId: row.id, summary: `Investor asked for further review of ${row.id}`, previousValue: { status: "resolved" }, newValue: { status: "under_review" } });
      await writeNotification(tx, { scope: "broker", brokerId: context.brokerId, roles: SERVICE, category: "support", severity: "warning", title: "Investor remains dissatisfied", body: row.subject, entityType: "service_case", entityId: row.id });
      return { complaint: serializeInvestorCase({ ...row, status: "under_review", resolvedAt: null }) };
    }
    throw new Response("Unsupported complaint action.", { status: 400 });
  }, transactionOptions);
}

export async function assignCase(actor: Actor, caseId: string, assigneeUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const row = await loadCase(tx, actor, caseId);
    let assignee: { id: string; fullName: string } | null = null;
    if (assigneeUserId) {
      assignee = await tx.user.findFirst({ where: { id: assigneeUserId, brokerId: actor.brokerId, status: "active" }, select: { id: true, fullName: true } });
      if (!assignee) throw new Response("That team member is not available in this tenant.", { status: 404 });
    }
    await tx.serviceCase.update({
      where: { id: caseId },
      data: { assignedToUserId: assignee?.id ?? null, status: row.status === "new" && assignee ? "assigned" : row.status, version: { increment: 1 } },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_CASE_ASSIGNED",
      entityType: "service_case",
      entityId: caseId,
      summary: assignee ? `Case ${caseId} assigned to ${assignee.fullName}` : `Case ${caseId} unassigned`,
      previousValue: { assignedToUserId: row.assignedToUserId },
      newValue: { assignedToUserId: assignee?.id ?? null },
    });
    return { assignedToUserId: assignee?.id ?? null };
  }, transactionOptions);
}

/** Internal findings are broker-only working notes and are never surfaced to the investor. */
export async function recordCaseFindings(actor: Actor, caseId: string, findings: unknown) {
  const parsed = parseFindings(findings);
  return prisma.$transaction(async (tx) => {
    const row = await loadCase(tx, actor, caseId);
    await tx.serviceCase.update({ where: { id: caseId }, data: { internalFindings: parsed, version: { increment: 1 } } });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_CASE_FINDINGS_RECORDED",
      entityType: "service_case",
      entityId: caseId,
      summary: `Internal findings updated on case ${caseId}`,
      previousValue: { hadFindings: Boolean(row.internalFindings) },
    });
    return { ok: true };
  }, transactionOptions);
}

export async function recordCaseRegulatoryStatus(actor: Actor, caseId: string, status: unknown, comment: unknown) {
  const next = String(status ?? "");
  if (!["pending", "referred_sro", "referred_ecma"].includes(next)) {
    throw new Response("Select a supported regulatory complaint status.", { status: 400 });
  }
  const note = String(comment ?? "").trim();
  if (next !== "pending" && note.length < 5) throw new Response("Record why and how the complaint was referred.", { status: 400 });
  if (note.length > 1_000) throw new Response("The regulatory comment must be 1,000 characters or fewer.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    const row = await loadCase(tx, actor, caseId);
    const regulatoryStatusAt = next === "pending" ? null : new Date();
    await tx.serviceCase.update({ where: { id: caseId }, data: { regulatoryStatus: next, regulatoryStatusAt, regulatoryComment: note || null, version: { increment: 1 } } });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_CASE_REGULATORY_STATUS_RECORDED",
      entityType: "service_case",
      entityId: caseId,
      summary: `Regulatory complaint status recorded for ${caseId}`,
      previousValue: { regulatoryStatus: row.regulatoryStatus },
      newValue: { regulatoryStatus: next, regulatoryStatusAt, regulatoryComment: note || null },
    });
    return { regulatoryStatus: next, regulatoryStatusAt: regulatoryStatusAt?.toISOString() ?? null };
  }, transactionOptions);
}

export async function listClientCases(actor: Actor, clientId: string) {
  const rows = await prisma.serviceCase.findMany({
    where: { brokerId: actor.brokerId, clientId },
    include: caseInclude,
    orderBy: { openedAt: "desc" },
    take: 25,
  });
  return rows.map(serializeCase);
}
