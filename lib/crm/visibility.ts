/**
 * The privacy boundary between broker and investor.
 *
 * Internal notes must never reach an investor. That is enforced here rather than
 * at each call site, in layers: filter (`visibleMessagesFor`), then a serializer
 * that THROWS if it is ever handed an internal record for an investor audience,
 * so forgetting the filter fails loudly instead of leaking.
 *
 * Pure - no Prisma import - so every rule is unit-testable without a database.
 */

import { INVESTOR_STATUS_LABELS, THREAD_STATUS_LABELS, type ThreadStatus } from "./status";

export const SHARED = "shared";
export const INTERNAL = "internal";

export type Audience = "broker" | "investor";
export type AuthorType = "broker" | "investor" | "system";

export type MessageLike = {
  id: string;
  visibility: string;
  authorType: string;
  authorUserId?: string | null;
  author?: { id: string; fullName: string } | null;
  body: string;
  createdAt: Date | string;
  attachments?: AttachmentLike[];
};

export type AttachmentLike = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  visibility: string;
};

export type ThreadLike = {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  relatedType?: string | null;
  relatedId?: string | null;
  assignedToUserId?: string | null;
  assignedTo?: { id: string; fullName: string } | null;
  client?: { id: string; clientCode: string; fullName: string } | null;
  account?: { id: string; accountNumber: string } | null;
  messageCount: number;
  lastMessageAt: Date | string;
  lastMessagePreview?: string | null;
  brokerUnreadCount: number;
  investorUnreadCount: number;
  createdAt: Date | string;
  resolvedAt?: Date | string | null;
  closedAt?: Date | string | null;
};

const iso = (value: Date | string) => (typeof value === "string" ? value : value.toISOString());

export function isInternal(item: { visibility: string }): boolean {
  return item.visibility === INTERNAL;
}

export function visibleMessagesFor<T extends { visibility: string }>(audience: Audience, messages: T[]): T[] {
  return audience === "broker" ? messages : messages.filter((message) => !isInternal(message));
}

export function visibleAttachmentsFor<T extends { visibility: string }>(audience: Audience, attachments: T[]): T[] {
  return audience === "broker" ? attachments : attachments.filter((attachment) => !isInternal(attachment));
}

function guardInvestorLeak(audience: Audience, visibility: string, kind: string): void {
  if (audience === "investor" && visibility === INTERNAL) {
    throw new Error(`Refusing to serialize an internal ${kind} for an investor.`);
  }
}

export function serializeAttachment(audience: Audience, attachment: AttachmentLike) {
  guardInvestorLeak(audience, attachment.visibility, "attachment");
  return {
    id: attachment.id,
    name: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    ...(audience === "broker" ? { visibility: attachment.visibility } : {}),
  };
}

/**
 * Investor serialization deliberately omits `authorUserId`, staff names and
 * `visibility`, and replaces the author with a neutral label - operational
 * metadata is not the investor's business.
 */
export function serializeMessage(audience: Audience, message: MessageLike) {
  guardInvestorLeak(audience, message.visibility, "message");
  const attachments = visibleAttachmentsFor(audience, message.attachments ?? []).map((item) =>
    serializeAttachment(audience, item),
  );
  if (audience === "investor") {
    return {
      id: message.id,
      body: message.body,
      createdAt: iso(message.createdAt),
      mine: message.authorType === "investor",
      authorLabel: message.authorType === "investor" ? "You" : "Your broker",
      attachments,
    };
  }
  return {
    id: message.id,
    body: message.body,
    createdAt: iso(message.createdAt),
    visibility: message.visibility,
    authorType: message.authorType,
    authorUserId: message.authorUserId ?? null,
    authorName: message.author?.fullName ?? (message.authorType === "investor" ? "Investor" : "System"),
    attachments,
  };
}

export function unreadFor(audience: Audience, thread: { brokerUnreadCount: number; investorUnreadCount: number }): number {
  return audience === "broker" ? thread.brokerUnreadCount : thread.investorUnreadCount;
}

export function serializeThreadSummary(audience: Audience, thread: ThreadLike) {
  const base = {
    id: thread.id,
    subject: thread.subject,
    category: thread.category,
    status: thread.status,
    statusLabel: (audience === "broker" ? THREAD_STATUS_LABELS : INVESTOR_STATUS_LABELS)[thread.status as ThreadStatus] ?? thread.status,
    relatedType: thread.relatedType ?? null,
    relatedId: thread.relatedId ?? null,
    messageCount: thread.messageCount,
    lastMessageAt: iso(thread.lastMessageAt),
    lastMessagePreview: thread.lastMessagePreview ?? null,
    unread: unreadFor(audience, thread),
    createdAt: iso(thread.createdAt),
  };
  if (audience === "investor") return base;
  return {
    ...base,
    priority: thread.priority,
    assignedToUserId: thread.assignedToUserId ?? null,
    assignedToName: thread.assignedTo?.fullName ?? null,
    client: thread.client ? { id: thread.client.id, code: thread.client.clientCode, name: thread.client.fullName } : null,
    account: thread.account ? { id: thread.account.id, number: thread.account.accountNumber } : null,
    resolvedAt: thread.resolvedAt ? iso(thread.resolvedAt) : null,
    closedAt: thread.closedAt ? iso(thread.closedAt) : null,
  };
}

export function serializeThreadDetail(audience: Audience, thread: ThreadLike, messages: MessageLike[]) {
  return {
    ...serializeThreadSummary(audience, thread),
    messages: visibleMessagesFor(audience, messages).map((message) => serializeMessage(audience, message)),
  };
}

/**
 * Counter and preview arithmetic, extracted so the never-disturb-the-investor
 * rules are directly unit-testable.
 *
 * An internal note advances `messageCount` and `lastMessageAt` but leaves
 * `investorUnreadCount` and `lastMessagePreview` untouched - the preview is
 * rendered in the investor's own list, so writing a staff note there would leak
 * its content.
 */
export function threadCountersAfterMessage(
  thread: {
    brokerUnreadCount: number;
    investorUnreadCount: number;
    messageCount: number;
    lastMessagePreview?: string | null;
    lastMessageAt: Date;
  },
  message: { visibility: string; authorType: AuthorType; body: string; createdAt: Date },
) {
  const internal = message.visibility === INTERNAL;
  const preview = message.body.trim().slice(0, 140);
  return {
    messageCount: thread.messageCount + 1,
    lastMessageAt: message.createdAt,
    lastMessagePreview: internal ? (thread.lastMessagePreview ?? null) : preview,
    brokerUnreadCount: internal
      ? thread.brokerUnreadCount
      : message.authorType === "investor"
        ? thread.brokerUnreadCount + 1
        : 0,
    investorUnreadCount: internal
      ? thread.investorUnreadCount
      : message.authorType === "broker"
        ? thread.investorUnreadCount + 1
        : 0,
  };
}

/** Runtime invariant: an internal message may never carry an investor notification. */
export function assertNoInvestorNotifyForInternal(visibility: string, notify: unknown): void {
  if (visibility === INTERNAL && notify) {
    throw new Error("An internal note must never notify the investor.");
  }
}
