import { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "../prisma";
import type { Actor } from "../server-auth";
import { writeAudit } from "../oms/audit-service";
import { writeNotification, SERVICE } from "../oms/notification-service";
import { lockThread } from "../oms/persistence";
import {
  assertThreadOpenForMessage,
  assertThreadTransition,
  isThreadStatus,
  statusAfterMessage,
  THREAD_STATUS_LABELS,
  type ThreadStatus,
} from "./status";
import {
  INTERNAL,
  SHARED,
  assertNoInvestorNotifyForInternal,
  serializeThreadDetail,
  serializeThreadSummary,
  threadCountersAfterMessage,
  visibleMessagesFor,
  type AuthorType,
} from "./visibility";
import {
  NOT_FOUND_MESSAGE,
  assertBrokerTenant,
  assertInvestorCanPost,
  assertInvestorOwns,
  brokerAttachmentWhere,
  investorAttachmentWhere,
  investorThreadWhere,
  type InvestorContextLike,
} from "./access";
import {
  parseBody,
  parseCategory,
  parsePriority,
  parseRelated,
  parseSubject,
  type ThreadPriority,
} from "./categories";
import type { PreparedAttachment } from "./attachments";
import { auditAutomaticRouting, routeInvestorConversation } from "./routing-service";

/**
 * Investor-servicing conversations. Mirrors `lib/oms/order-service.ts`: every
 * mutation runs in a Serializable transaction that writes the record, an audit
 * row, and any notification atomically, and throws `Response` for user-facing
 * failures so `lib/api.ts` maps them without extra plumbing.
 */

const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

const newThreadId = () => `THR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const newMessageId = () => `MSG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const newAttachmentId = () => `ATT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

const threadInclude = {
  client: { select: { id: true, clientCode: true, fullName: true } },
  account: { select: { id: true, accountNumber: true } },
  assignedTo: { select: { id: true, fullName: true } },
  serviceRequest: { select: { id: true, requestType: true, status: true, subject: true, resolutionNotes: true, resolvedAt: true } },
} satisfies Prisma.CommunicationThreadInclude;

const messageInclude = {
  author: { select: { id: true, fullName: true } },
  attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, visibility: true } },
} satisfies Prisma.CommunicationMessageInclude;

export function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

// ---------------------------------------------------------------------------
// Shared write core
// ---------------------------------------------------------------------------

type AppendInput = {
  threadId: string;
  visibility: typeof SHARED | typeof INTERNAL;
  authorType: AuthorType;
  authorUserId: string | null;
  body: string;
  attachments?: PreparedAttachment[];
  brokerId: string;
  clientId: string;
};

/**
 * Appends a message and rolls the thread's counters, preview and status forward.
 * Status is derived by {@link statusAfterMessage}, which leaves it untouched for
 * `system` authorship - the mechanism that stops an internal note producing a
 * state change the investor could observe.
 */
export async function appendMessage(
  tx: Prisma.TransactionClient,
  thread: {
    id: string;
    status: string;
    messageCount: number;
    lastMessagePreview: string | null;
    lastMessageAt: Date;
    brokerUnreadCount: number;
    investorUnreadCount: number;
  },
  input: AppendInput,
) {
  const createdAt = new Date();
  const messageId = newMessageId();

  await tx.communicationMessage.create({
    data: {
      id: messageId,
      threadId: input.threadId,
      visibility: input.visibility,
      authorType: input.authorType,
      authorUserId: input.authorUserId,
      body: input.body,
      createdAt,
    },
  });

  for (const attachment of input.attachments ?? []) {
    const id = newAttachmentId();
    await tx.communicationAttachment.create({
      data: {
        id,
        brokerId: input.brokerId,
        clientId: input.clientId,
        threadId: input.threadId,
        messageId,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        // An attachment inherits its message's visibility, so a file on an
        // internal note is never downloadable by the investor.
        visibility: input.visibility,
      },
    });
    await tx.communicationAttachmentContent.create({
      data: { attachmentId: id, bytes: Buffer.from(attachment.bytes) },
    });
  }

  const counters = threadCountersAfterMessage(thread, {
    visibility: input.visibility,
    authorType: input.authorType,
    body: input.body,
    createdAt,
  });
  const nextStatus = statusAfterMessage(thread.status, input.authorType);

  await tx.communicationThread.update({
    where: { id: input.threadId },
    data: {
      ...counters,
      status: nextStatus,
      resolvedAt: nextStatus === "resolved" ? undefined : null,
      version: { increment: 1 },
    },
  });

  return { messageId, createdAt, nextStatus };
}

// ---------------------------------------------------------------------------
// Broker reads
// ---------------------------------------------------------------------------

export type ListThreadsQuery = {
  page: number;
  pageSize: number;
  status?: string;
  category?: string;
  priority?: string;
  assigned?: string;
  clientId?: string;
  query?: string;
};

export async function listThreads(actor: Actor, query: ListThreadsQuery) {
  const where: Prisma.CommunicationThreadWhereInput = { brokerId: actor.brokerId };

  if (query.status === "open_all") where.status = { in: ["open", "pending_broker", "pending_client"] };
  else if (query.status && isThreadStatus(query.status)) where.status = query.status;
  if (query.category) where.category = query.category;
  if (query.priority) where.priority = query.priority;
  if (query.clientId) where.clientId = query.clientId;
  if (query.assigned === "unassigned") where.assignedToUserId = null;
  else if (query.assigned === "me") where.assignedToUserId = actor.id;
  else if (query.assigned) where.assignedToUserId = query.assigned;

  const search = (query.query ?? "").trim().slice(0, 120);
  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { id: { contains: search, mode: "insensitive" } },
      { relatedId: { contains: search, mode: "insensitive" } },
      { client: { fullName: { contains: search, mode: "insensitive" } } },
      { client: { clientCode: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [rows, total, unreadThreads, mine, unassigned] = await Promise.all([
    prisma.communicationThread.findMany({
      where,
      include: threadInclude,
      orderBy: { lastMessageAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.communicationThread.count({ where }),
    prisma.communicationThread.count({ where: { brokerId: actor.brokerId, brokerUnreadCount: { gt: 0 } } }),
    prisma.communicationThread.count({ where: { brokerId: actor.brokerId, assignedToUserId: actor.id, status: { in: ["open", "pending_broker", "pending_client"] } } }),
    prisma.communicationThread.count({ where: { brokerId: actor.brokerId, assignedToUserId: null, status: { in: ["open", "pending_broker", "pending_client"] } } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  return {
    threads: rows.map((row) => serializeThreadSummary("broker", row)),
    pagination: { page: Math.min(query.page, pageCount), pageSize: query.pageSize, total, pageCount },
    facets: { unreadThreads, mine, unassigned },
  };
}

/** Messages page newest-first so page 1 is what a conversation view wants; the serializer reverses them. */
export async function getThread(actor: Actor, threadId: string, page = 1, pageSize = 50) {
  const thread = await prisma.communicationThread.findFirst({
    where: { id: threadId, brokerId: actor.brokerId },
    include: threadInclude,
  });
  assertBrokerTenant(actor, thread);

  const [messages, total] = await Promise.all([
    prisma.communicationMessage.findMany({
      where: { threadId },
      include: messageInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.communicationMessage.count({ where: { threadId } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return {
    thread: {
      ...serializeThreadDetail("broker", thread, messages.slice().reverse()),
      serviceRequest: thread.serviceRequest ? {
        id: thread.serviceRequest.id,
        requestType: thread.serviceRequest.requestType,
        status: thread.serviceRequest.status,
        subject: thread.serviceRequest.subject,
        resolutionNotes: thread.serviceRequest.resolutionNotes,
        resolvedAt: thread.serviceRequest.resolvedAt?.toISOString() ?? null,
        allowedDecisions: ["open", "under_review"].includes(thread.serviceRequest.status)
          ? thread.serviceRequest.requestType === "account_closure" ? ["approve_closure", "resolve", "reject"] : ["resolve", "reject"]
          : [],
      } : null,
    },
    pagination: { page: Math.min(page, pageCount), pageSize, total, pageCount },
  };
}

// ---------------------------------------------------------------------------
// Broker writes
// ---------------------------------------------------------------------------

export type CreateThreadInput = {
  clientId: string;
  subject: unknown;
  body: unknown;
  category: unknown;
  priority?: unknown;
  relatedType?: unknown;
  relatedId?: unknown;
  attachments?: PreparedAttachment[];
};

export async function createBrokerThread(actor: Actor, input: CreateThreadInput) {
  const subject = parseSubject(input.subject);
  const body = parseBody(input.body);
  const category = parseCategory(input.category);
  const priority = parsePriority(input.priority);
  const { relatedType, relatedId } = parseRelated(input.relatedType, input.relatedId);

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: input.clientId, brokerId: actor.brokerId },
      include: { accounts: { select: { id: true }, take: 1 } },
    });
    if (!client) throw new Response("Client not found for this tenant.", { status: 404 });

    const id = newThreadId();
    const now = new Date();
    await tx.communicationThread.create({
      data: {
        id,
        brokerId: actor.brokerId,
        clientId: client.id,
        accountId: client.accounts[0]?.id ?? null,
        subject,
        category,
        priority,
        status: "pending_client",
        relatedType,
        relatedId,
        assignedToUserId: actor.id,
        openedBy: "broker",
        messageCount: 0,
        lastMessageAt: now,
        brokerUnreadCount: 0,
        investorUnreadCount: 0,
      },
    });

    await appendMessage(
      tx,
      { id, status: "pending_client", messageCount: 0, lastMessagePreview: null, lastMessageAt: now, brokerUnreadCount: 0, investorUnreadCount: 0 },
      { threadId: id, visibility: SHARED, authorType: "broker", authorUserId: actor.id, body, attachments: input.attachments, brokerId: actor.brokerId, clientId: client.id },
    );

    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_THREAD_CREATED",
      entityType: "communication_thread",
      entityId: id,
      summary: `Conversation opened with ${client.fullName}: ${subject}`,
      newValue: { category, priority, relatedType, relatedId },
    });
    await writeNotification(tx, {
      scope: "investor",
      brokerId: actor.brokerId,
      clientId: client.id,
      category: "support",
      severity: "info",
      title: "Message from your broker",
      body: subject,
      entityType: "communication_thread",
      entityId: id,
    });

    return { id, status: "pending_client" };
  }, transactionOptions);
}

async function loadThreadForWrite(tx: Prisma.TransactionClient, actor: Actor, threadId: string) {
  await lockThread(tx, threadId);
  const thread = await tx.communicationThread.findFirst({
    where: { id: threadId, brokerId: actor.brokerId },
    include: { client: { select: { id: true, fullName: true } } },
  });
  assertBrokerTenant(actor, thread);
  return thread;
}

export async function postBrokerMessage(actor: Actor, threadId: string, rawBody: unknown, attachments?: PreparedAttachment[]) {
  const body = parseBody(rawBody);
  return prisma.$transaction(async (tx) => {
    const thread = await loadThreadForWrite(tx, actor, threadId);
    assertThreadOpenForMessage(thread.status);

    const result = await appendMessage(tx, thread, {
      threadId,
      visibility: SHARED,
      authorType: "broker",
      authorUserId: actor.id,
      body,
      attachments,
      brokerId: actor.brokerId,
      clientId: thread.clientId,
    });

    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_MESSAGE_POSTED",
      entityType: "communication_thread",
      entityId: threadId,
      summary: `Replied to ${thread.client.fullName}`,
      previousValue: { status: thread.status },
      newValue: { status: result.nextStatus, messageId: result.messageId },
    });
    await writeNotification(tx, {
      scope: "investor",
      brokerId: actor.brokerId,
      clientId: thread.clientId,
      category: "support",
      severity: "info",
      title: "Your broker replied",
      body: thread.subject,
      entityType: "communication_thread",
      entityId: threadId,
    });

    return { status: result.nextStatus, messageId: result.messageId };
  }, transactionOptions);
}

/**
 * Broker-only note. Deliberately contains no `writeNotification` call and is
 * written with `authorType: "system"` so it cannot change the conversation
 * status either - an internal note is invisible to the investor in every sense.
 */
export async function addInternalNote(actor: Actor, threadId: string, rawBody: unknown, attachments?: PreparedAttachment[]) {
  const body = parseBody(rawBody);
  const notify = null;
  assertNoInvestorNotifyForInternal(INTERNAL, notify);

  return prisma.$transaction(async (tx) => {
    const thread = await loadThreadForWrite(tx, actor, threadId);
    assertThreadOpenForMessage(thread.status);

    const result = await appendMessage(tx, thread, {
      threadId,
      visibility: INTERNAL,
      authorType: "system",
      authorUserId: actor.id,
      body,
      attachments,
      brokerId: actor.brokerId,
      clientId: thread.clientId,
    });

    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_INTERNAL_NOTE_ADDED",
      entityType: "communication_thread",
      entityId: threadId,
      summary: `Internal note added on ${thread.client.fullName}'s conversation`,
      newValue: { messageId: result.messageId, visibility: INTERNAL },
    });

    return { status: thread.status, messageId: result.messageId };
  }, transactionOptions);
}

export async function assignThread(actor: Actor, threadId: string, assigneeUserId: string | null) {
  return prisma.$transaction(async (tx) => {
    const thread = await loadThreadForWrite(tx, actor, threadId);

    let assignee: { id: string; fullName: string } | null = null;
    if (assigneeUserId) {
      assignee = await tx.user.findFirst({
        where: { id: assigneeUserId, brokerId: actor.brokerId, status: "active" },
        select: { id: true, fullName: true },
      });
      if (!assignee) throw new Response("That team member is not available in this tenant.", { status: 404 });
    }

    await tx.communicationThread.update({
      where: { id: threadId },
      data: { assignedToUserId: assignee?.id ?? null, version: { increment: 1 } },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_THREAD_ASSIGNED",
      entityType: "communication_thread",
      entityId: threadId,
      summary: assignee ? `Conversation assigned to ${assignee.fullName}` : "Conversation unassigned",
      previousValue: { assignedToUserId: thread.assignedToUserId },
      newValue: { assignedToUserId: assignee?.id ?? null },
    });

    return { assignedToUserId: assignee?.id ?? null };
  }, transactionOptions);
}

export async function changeThreadStatus(actor: Actor, threadId: string, next: string, reason?: string) {
  if (!isThreadStatus(next)) throw new Response("That conversation status is not supported.", { status: 400 });
  return prisma.$transaction(async (tx) => {
    const thread = await loadThreadForWrite(tx, actor, threadId);
    assertThreadTransition(thread.status, next);

    const now = new Date();
    await tx.communicationThread.update({
      where: { id: threadId },
      data: {
        status: next,
        resolvedAt: next === "resolved" ? now : null,
        closedAt: next === "closed" ? now : null,
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_THREAD_STATUS_CHANGED",
      entityType: "communication_thread",
      entityId: threadId,
      summary: `Conversation moved to ${THREAD_STATUS_LABELS[next as ThreadStatus]}`,
      previousValue: { status: thread.status },
      newValue: { status: next },
      reason: reason ?? null,
    });

    if (next === "resolved" || next === "closed") {
      await writeNotification(tx, {
        scope: "investor",
        brokerId: actor.brokerId,
        clientId: thread.clientId,
        category: "support",
        severity: next === "resolved" ? "success" : "info",
        title: next === "resolved" ? "Your request was resolved" : "Conversation closed",
        body: thread.subject,
        entityType: "communication_thread",
        entityId: threadId,
      });
    }

    return { status: next };
  }, transactionOptions);
}

export async function changeThreadPriority(actor: Actor, threadId: string, next: unknown) {
  const priority: ThreadPriority = parsePriority(next);
  return prisma.$transaction(async (tx) => {
    const thread = await loadThreadForWrite(tx, actor, threadId);
    await tx.communicationThread.update({ where: { id: threadId }, data: { priority, version: { increment: 1 } } });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "CRM_THREAD_PRIORITY_CHANGED",
      entityType: "communication_thread",
      entityId: threadId,
      summary: `Conversation priority set to ${priority}`,
      previousValue: { priority: thread.priority },
      newValue: { priority },
    });
    return { priority };
  }, transactionOptions);
}

export async function markThreadReadByBroker(actor: Actor, threadId: string) {
  const updated = await prisma.communicationThread.updateMany({
    where: { id: threadId, brokerId: actor.brokerId },
    data: { brokerUnreadCount: 0 },
  });
  if (!updated.count) throw new Response(NOT_FOUND_MESSAGE, { status: 404 });
  return { ok: true };
}

export async function getAttachmentForBroker(actor: Actor, attachmentId: string) {
  const attachment = await prisma.communicationAttachment.findFirst({
    where: brokerAttachmentWhere(actor, attachmentId),
    include: { content: true },
  });
  if (!attachment?.content) throw new Response(NOT_FOUND_MESSAGE, { status: 404 });
  // Return a narrowed shape so callers get a non-null `content` without re-checking.
  return {
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    content: { bytes: attachment.content.bytes },
  };
}

// ---------------------------------------------------------------------------
// Investor side
// ---------------------------------------------------------------------------

export async function listInvestorThreads(context: InvestorContextLike, page = 1, pageSize = 25) {
  const where = investorThreadWhere(context);
  const [rows, total] = await Promise.all([
    prisma.communicationThread.findMany({
      where,
      include: threadInclude,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.communicationThread.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return {
    threads: rows.map((row) => serializeThreadSummary("investor", row)),
    pagination: { page: Math.min(page, pageCount), pageSize, total, pageCount },
  };
}

export async function getInvestorThread(context: InvestorContextLike, threadId: string, page = 1, pageSize = 50) {
  const thread = await prisma.communicationThread.findFirst({
    where: { id: threadId, ...investorThreadWhere(context) },
    include: threadInclude,
  });
  assertInvestorOwns(context, thread);

  // Internal notes are excluded at the query level as well as by the serializer.
  const where = { threadId, visibility: SHARED };
  const [messages, total] = await Promise.all([
    prisma.communicationMessage.findMany({
      where,
      include: messageInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.communicationMessage.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return {
    thread: serializeThreadDetail("investor", thread, visibleMessagesFor("investor", messages.slice().reverse())),
    pagination: { page: Math.min(page, pageCount), pageSize, total, pageCount },
  };
}

export async function createInvestorThread(
  context: InvestorContextLike,
  input: { subject: unknown; body: unknown; category: unknown; relatedType?: unknown; relatedId?: unknown; attachments?: PreparedAttachment[] },
) {
  const subject = parseSubject(input.subject);
  const body = parseBody(input.body);
  const category = parseCategory(input.category);
  const { relatedType, relatedId } = parseRelated(input.relatedType, input.relatedId);

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: context.clientId, brokerId: context.brokerId },
      include: { accounts: { select: { id: true }, take: 1 } },
    });
    if (!client) throw new Response("Investor profile not found.", { status: 404 });

    const id = newThreadId();
    const now = new Date();
    const routedOwner = await routeInvestorConversation(tx, { brokerId: context.brokerId, clientId: client.id, category });
    await tx.communicationThread.create({
      data: {
        id,
        brokerId: context.brokerId,
        clientId: client.id,
        accountId: client.accounts[0]?.id ?? null,
        subject,
        category,
        // An investor cannot set priority; complaints start elevated by policy.
        priority: category === "complaint" ? "high" : "normal",
        status: "pending_broker",
        relatedType,
        relatedId,
        assignedToUserId: routedOwner?.id ?? null,
        openedBy: "investor",
        messageCount: 0,
        lastMessageAt: now,
        brokerUnreadCount: 0,
        investorUnreadCount: 0,
      },
    });

    await appendMessage(
      tx,
      { id, status: "pending_broker", messageCount: 0, lastMessagePreview: null, lastMessageAt: now, brokerUnreadCount: 0, investorUnreadCount: 0 },
      { threadId: id, visibility: SHARED, authorType: "investor", authorUserId: null, body, attachments: input.attachments, brokerId: context.brokerId, clientId: client.id },
    );

    await writeAudit(tx, {
      brokerId: context.brokerId,
      actorId: null,
      action: "CRM_THREAD_CREATED",
      entityType: "communication_thread",
      entityId: id,
      summary: `${client.fullName} opened a support request: ${subject}`,
      newValue: { category, relatedType, relatedId, channel: "investor_portal", assignedToUserId: routedOwner?.id ?? null, routingReason: routedOwner?.reason ?? "no_eligible_owner" },
    });
    await auditAutomaticRouting(tx, { brokerId: context.brokerId, entityType: "communication_thread", entityId: id, owner: routedOwner });
    await writeNotification(tx, {
      scope: "broker",
      brokerId: context.brokerId,
      roles: SERVICE,
      category: "support",
      severity: category === "complaint" ? "warning" : "info",
      title: category === "complaint" ? "New complaint from an investor" : "New investor request",
      body: `${client.fullName}: ${subject}`,
      entityType: "communication_thread",
      entityId: id,
    });

    return { id, status: "pending_broker" };
  }, transactionOptions);
}

export async function postInvestorMessage(
  context: InvestorContextLike,
  threadId: string,
  rawBody: unknown,
  attachments?: PreparedAttachment[],
) {
  const body = parseBody(rawBody);
  return prisma.$transaction(async (tx) => {
    await lockThread(tx, threadId);
    const thread = await tx.communicationThread.findFirst({
      where: { id: threadId, ...investorThreadWhere(context) },
      include: { client: { select: { id: true, fullName: true } } },
    });
    assertInvestorOwns(context, thread);
    assertInvestorCanPost(thread);

    const result = await appendMessage(tx, thread, {
      threadId,
      visibility: SHARED,
      authorType: "investor",
      authorUserId: null,
      body,
      attachments,
      brokerId: context.brokerId,
      clientId: thread.clientId,
    });

    const reopened = thread.status === "resolved";
    await writeAudit(tx, {
      brokerId: context.brokerId,
      actorId: null,
      action: reopened ? "CRM_THREAD_REOPENED" : "CRM_MESSAGE_POSTED",
      entityType: "communication_thread",
      entityId: threadId,
      summary: `${thread.client.fullName} replied${reopened ? " and reopened the conversation" : ""}`,
      previousValue: { status: thread.status },
      newValue: { status: result.nextStatus, messageId: result.messageId },
    });
    await writeNotification(tx, {
      scope: "broker",
      brokerId: context.brokerId,
      roles: SERVICE,
      category: "support",
      severity: thread.priority === "urgent" || thread.priority === "high" ? "warning" : "info",
      title: reopened ? "Investor reopened a conversation" : "Investor replied",
      body: `${thread.client.fullName}: ${thread.subject}`,
      entityType: "communication_thread",
      entityId: threadId,
    });

    return { status: result.nextStatus, messageId: result.messageId, reopened };
  }, transactionOptions);
}

export async function markThreadReadByInvestor(context: InvestorContextLike, threadId: string) {
  const updated = await prisma.communicationThread.updateMany({
    where: { id: threadId, ...investorThreadWhere(context) },
    data: { investorUnreadCount: 0 },
  });
  if (!updated.count) throw new Response(NOT_FOUND_MESSAGE, { status: 404 });
  return { ok: true };
}

export async function getAttachmentForInvestor(context: InvestorContextLike, attachmentId: string) {
  const attachment = await prisma.communicationAttachment.findFirst({
    where: investorAttachmentWhere(context, attachmentId),
    include: { content: true },
  });
  if (!attachment?.content) throw new Response(NOT_FOUND_MESSAGE, { status: 404 });
  // Return a narrowed shape so callers get a non-null `content` without re-checking.
  return {
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    content: { bytes: attachment.content.bytes },
  };
}

export async function investorSupportSummary(context: InvestorContextLike) {
  const where = investorThreadWhere(context);
  const [openThreads, unreadRows] = await Promise.all([
    prisma.communicationThread.count({ where: { ...where, status: { in: ["open", "pending_broker", "pending_client"] } } }),
    prisma.communicationThread.findMany({ where: { ...where, investorUnreadCount: { gt: 0 } }, select: { investorUnreadCount: true } }),
  ]);
  return { openThreads, unread: unreadRows.reduce((total, row) => total + row.investorUnreadCount, 0) };
}

/**
 * Opens a conversation alongside an existing ClientServiceRequest so the
 * structured request and its discussion stay linked. Takes a transaction client
 * so it commits atomically with the request that triggered it.
 */
export async function openThreadForServiceRequest(
  tx: Prisma.TransactionClient,
  input: { brokerId: string; clientId: string; accountId?: string | null; requestId: string; subject: string; body: string; category: string; clientName: string; attachments?: PreparedAttachment[] },
) {
  const id = newThreadId();
  const now = new Date();
  const routedOwner = await routeInvestorConversation(tx, { brokerId: input.brokerId, clientId: input.clientId, category: input.category });
  await tx.communicationThread.create({
    data: {
      id,
      brokerId: input.brokerId,
      clientId: input.clientId,
      accountId: input.accountId ?? null,
      subject: input.subject,
      category: input.category,
      priority: "normal",
      status: "pending_broker",
      relatedType: "service_request",
      relatedId: input.requestId,
      assignedToUserId: routedOwner?.id ?? null,
      openedBy: "investor",
      messageCount: 0,
      lastMessageAt: now,
      brokerUnreadCount: 0,
      investorUnreadCount: 0,
    },
  });
  await appendMessage(
    tx,
    { id, status: "pending_broker", messageCount: 0, lastMessagePreview: null, lastMessageAt: now, brokerUnreadCount: 0, investorUnreadCount: 0 },
    { threadId: id, visibility: SHARED, authorType: "investor", authorUserId: null, body: input.body, attachments: input.attachments, brokerId: input.brokerId, clientId: input.clientId },
  );
  await writeAudit(tx, {
    brokerId: input.brokerId,
    actorId: null,
    action: "CRM_THREAD_CREATED",
    entityType: "communication_thread",
    entityId: id,
    summary: `${input.clientName} opened a support request: ${input.subject}`,
    newValue: { category: input.category, relatedType: "service_request", relatedId: input.requestId },
  });
  await auditAutomaticRouting(tx, { brokerId: input.brokerId, entityType: "communication_thread", entityId: id, owner: routedOwner });
  await writeNotification(tx, {
    scope: "broker",
    brokerId: input.brokerId,
    roles: SERVICE,
    category: "support",
    severity: "info",
    title: "New investor request",
    body: `${input.clientName}: ${input.subject}`,
    entityType: "communication_thread",
    entityId: id,
  });
  return { id };
}
