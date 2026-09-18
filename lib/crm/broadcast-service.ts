import { createHash } from "node:crypto";
import { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "../prisma";
import { CRM_PERMISSIONS, hasPermission } from "../frank";
import type { Actor } from "../server-auth";
import { writeAudit } from "../oms/audit-service";
import { parseBroadcastInput, type BroadcastInput } from "./broadcasts";

type Db = Prisma.TransactionClient;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const instrumentScope = (brokerId: string): Prisma.InstrumentWhereInput => ({ OR: [
  { brokerAccess: { some: { brokerId } } },
  { holdings: { some: { account: { client: { brokerId } } } } },
  { corporateActions: { some: { brokerId } } },
] });

export async function broadcastOptions(actor: Actor) {
  const [instruments, events] = await Promise.all([
    prisma.instrument.findMany({ where: instrumentScope(actor.brokerId), select: { id: true, symbol: true, issuer: true, name: true }, orderBy: { symbol: "asc" } }),
    prisma.corporateAction.findMany({ where: { brokerId: actor.brokerId }, include: { instrument: { select: { symbol: true } } }, orderBy: { recordDate: "desc" } }),
  ]);
  return {
    instruments: instruments.map((item) => ({ id: item.id, label: `${item.symbol} · ${item.issuer || item.name}` })),
    events: events.map((item) => ({ id: item.id, instrumentId: item.instrumentId, label: `${item.instrument.symbol} · ${item.actionType.replaceAll("_", " ")} · ${item.recordDate.toISOString().slice(0, 10)} · ${item.sourceReference}` })),
  };
}

/** Client-level `some` filters deduplicate investors with multiple accounts.
 * Holders use current total quantity; event audiences use record-date entitlements. */
export function broadcastAudienceWhere(brokerId: string, input: BroadcastInput): Prisma.ClientWhereInput {
  const where: Prisma.ClientWhereInput = { brokerId, status: { notIn: ["closed", "rejected"] } };
  if (input.segment === "retail") where.clientType = "individual";
  if (input.segment === "institutions") where.clientType = { in: ["institution", "corporate"] };
  if (input.segment === "holders") where.accounts = { some: { client: { brokerId }, holdings: { some: { instrumentId: input.instrumentId, totalQuantity: { gt: 0 } } } } };
  if (input.segment === "event_entitlements") where.accounts = { some: { client: { brokerId }, corporateActionEntitlements: { some: { corporateActionId: input.corporateActionId, eligibleQuantity: { gt: 0 } } } } };
  return where;
}

async function resolveAudience(db: Db, actor: Actor, input: BroadcastInput) {
  let instrumentId = input.instrumentId;
  let eventLabel = input.eventName;
  if (input.corporateActionId) {
    const event = await db.corporateAction.findFirst({ where: { id: input.corporateActionId, brokerId: actor.brokerId }, select: { instrumentId: true, actionType: true, recordDate: true, sourceReference: true } });
    if (!event) throw new Response("Event not found for this broker.", { status: 404 });
    if (instrumentId && instrumentId !== event.instrumentId) throw new Response("The selected event belongs to a different security.", { status: 400 });
    instrumentId = event.instrumentId;
    eventLabel = `${event.actionType.replaceAll("_", " ")} · ${event.recordDate.toISOString().slice(0, 10)} · ${event.sourceReference}`;
  }
  const instrument = instrumentId ? await db.instrument.findFirst({ where: { id: instrumentId, ...instrumentScope(actor.brokerId) }, select: { id: true, symbol: true, issuer: true } }) : null;
  if (instrumentId && !instrument) throw new Response("Security not found for this broker.", { status: 404 });
  const contextLabel = [instrument ? `${instrument.symbol} · ${instrument.issuer}` : "", eventLabel].filter(Boolean).join(" / ") || null;
  const clients = await db.client.findMany({ where: broadcastAudienceWhere(actor.brokerId, { ...input, instrumentId }), select: { id: true, fullName: true, clientCode: true }, orderBy: { id: "asc" } });
  return { clients, contextLabel, instrumentId, token: digest({ input, recipients: clients.map((client) => client.id) }) };
}

export async function previewBroadcast(actor: Actor, raw: Record<string, unknown>) {
  const input = parseBroadcastInput(raw);
  const audience = await resolveAudience(prisma, actor, input);
  return { count: audience.clients.length, sample: audience.clients.slice(0, 8), token: audience.token, contextLabel: audience.contextLabel };
}

export async function sendBroadcast(actor: Actor, raw: Record<string, unknown>) {
  if (!hasPermission(actor.role, CRM_PERMISSIONS.broadcastSend)) throw new Response("You cannot send broadcasts.", { status: 403 });
  const input = parseBroadcastInput(raw);
  const requestKey = typeof raw.requestKey === "string" ? raw.requestKey : "";
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestKey)) throw new Response("A valid send reference is required.", { status: 400 });
  const requestHash = digest(input);
  // No external delivery happens in this transaction. Inbox copies, notifications,
  // audience snapshot and audit either all commit or all roll back.
  const send = () => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.brokerId}), hashtext(${requestKey}))`;
    const existing = await tx.communicationBroadcast.findUnique({ where: { brokerId_requestKey: { brokerId: actor.brokerId, requestKey } } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Response("This send reference belongs to a different message.", { status: 409 });
      return { id: existing.id, recipientCount: existing.recipientCount, duplicate: true };
    }
    const audience = await resolveAudience(tx, actor, input);
    if (typeof raw.audienceToken !== "string" || raw.audienceToken !== audience.token) throw new Response("The audience or message changed. Review the recipients again before sending.", { status: 409 });
    if (!audience.clients.length) throw new Response("No clients match this audience.", { status: 400 });
    const id = `BCT-${crypto.randomUUID()}`;
    const now = new Date();
    await tx.communicationBroadcast.create({ data: {
      id, brokerId: actor.brokerId, requestKey, requestHash, createdBy: actor.id,
      subject: input.subject, body: input.body, segment: input.segment, channel: input.channel,
      instrumentId: audience.instrumentId || null, corporateActionId: input.corporateActionId || null,
      contextLabel: audience.contextLabel, recipientCount: audience.clients.length, sentAt: now,
    } });
    // Bound SQL parameter counts without silently truncating large audiences.
    for (let offset = 0; offset < audience.clients.length; offset += 500) {
      const recipients = audience.clients.slice(offset, offset + 500).map((client) => ({ ...client, threadId: `THR-${crypto.randomUUID()}`, messageId: `MSG-${crypto.randomUUID()}` }));
      await tx.communicationThread.createMany({ data: recipients.map((client) => ({
        id: client.threadId, brokerId: actor.brokerId, clientId: client.id, broadcastId: id,
        subject: input.subject, category: audience.instrumentId ? "portfolio" : "general", status: "pending_client",
        assignedToUserId: actor.id, openedBy: "broker", messageCount: 1, investorUnreadCount: 1,
        lastMessageAt: now, lastMessagePreview: input.body.slice(0, 140),
      })) });
      await tx.communicationMessage.createMany({ data: recipients.map((client) => ({
        id: client.messageId, threadId: client.threadId, broadcastId: id, visibility: "shared",
        authorType: "broker", authorUserId: actor.id, body: input.body, createdAt: now, deliveredAt: now,
      })) });
      await tx.notification.createMany({ data: recipients.map((client) => ({
        id: crypto.randomUUID(), dedupeKey: `broadcast:${id}:${client.id}`, brokerId: actor.brokerId,
        scope: "investor", clientId: client.id, category: "support", severity: "info",
        title: "Message from your broker", body: input.subject, entityType: "communication_thread", entityId: client.threadId,
      })) });
    }
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "CRM_BROADCAST_SENT", entityType: "communication_broadcast", entityId: id,
      summary: `Broadcast sent to ${audience.clients.length} client inboxes: ${input.subject}`,
      newValue: { segment: input.segment, instrumentId: audience.instrumentId, corporateActionId: input.corporateActionId, contextLabel: audience.contextLabel, channel: input.channel, recipientCount: audience.clients.length },
    });
    return { id, recipientCount: audience.clients.length, duplicate: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000, maxWait: 10_000 });
  // A serialization conflict rolls back all copies. Retrying with the same key
  // is safe, including simultaneous requests or a lost HTTP response.
  for (let attempt = 0; ; attempt++) {
    try { return await send(); }
    catch (error) {
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue;
      throw error;
    }
  }
}

export async function listBroadcasts(actor: Actor, page = 1) {
  const where = { brokerId: actor.brokerId };
  const [rows, total] = await Promise.all([
    prisma.communicationBroadcast.findMany({ where, orderBy: [{ sentAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25 }),
    prisma.communicationBroadcast.count({ where }),
  ]);
  const ids = rows.map((row) => row.id);
  const [delivered, read] = await Promise.all([
    prisma.communicationMessage.groupBy({ by: ["broadcastId"], where: { broadcastId: { in: ids }, deliveredAt: { not: null }, thread: { brokerId: actor.brokerId } }, _count: { _all: true } }),
    prisma.communicationMessage.groupBy({ by: ["broadcastId"], where: { broadcastId: { in: ids }, readAt: { not: null }, thread: { brokerId: actor.brokerId } }, _count: { _all: true } }),
  ]);
  return { broadcasts: rows.map((row) => ({ id: row.id, subject: row.subject, body: row.body, segment: row.segment, contextLabel: row.contextLabel, channel: row.channel, recipientCount: row.recipientCount, sentAt: row.sentAt.toISOString(), delivered: delivered.find((item) => item.broadcastId === row.id)?._count._all ?? 0, read: read.find((item) => item.broadcastId === row.id)?._count._all ?? 0 })), total, page, pageCount: Math.max(1, Math.ceil(total / 25)) };
}

export async function broadcastRecipients(actor: Actor, id: string, page = 1) {
  const broadcast = await prisma.communicationBroadcast.findFirst({ where: { id, brokerId: actor.brokerId } });
  if (!broadcast) throw new Response("Broadcast not found.", { status: 404 });
  const rows = await prisma.communicationMessage.findMany({ where: { broadcastId: id, thread: { brokerId: actor.brokerId } }, include: { thread: { select: { client: { select: { id: true, fullName: true, clientCode: true } } } } }, orderBy: { id: "asc" }, take: 25, skip: (page - 1) * 25 });
  return { recipients: rows.map((row) => ({ threadId: row.threadId, clientId: row.thread.client.id, name: row.thread.client.fullName, code: row.thread.client.clientCode, deliveredAt: row.deliveredAt?.toISOString() ?? null, readAt: row.readAt?.toISOString() ?? null })), page, pageCount: Math.max(1, Math.ceil(broadcast.recipientCount / 25)) };
}
