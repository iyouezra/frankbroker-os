/**
 * Conversation state machine. Mirrors `lib/oms/status.ts` in shape so the CRM
 * reads the same way as the order workflow. Pure - no Prisma import - so the
 * transition rules are unit-testable without a database.
 */

export const THREAD_STATUSES = ["open", "pending_broker", "pending_client", "resolved", "closed"] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const THREAD_STATUS_LABELS: Record<ThreadStatus, string> = {
  open: "Open",
  pending_broker: "Awaiting broker",
  pending_client: "Awaiting investor",
  resolved: "Resolved",
  closed: "Closed",
};

/** Investor-facing wording - deliberately plainer than the broker vocabulary. */
export const INVESTOR_STATUS_LABELS: Record<ThreadStatus, string> = {
  open: "Open",
  pending_broker: "Waiting for broker",
  pending_client: "Waiting for you",
  resolved: "Resolved",
  closed: "Closed",
};

export class InvalidThreadTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`A conversation cannot move from ${from} to ${to}.`);
    this.name = "InvalidThreadTransitionError";
  }
}

/** `closed` is terminal: reopening requires a new conversation. */
const transitions: Record<ThreadStatus, readonly ThreadStatus[]> = {
  open: ["pending_broker", "pending_client", "resolved", "closed"],
  pending_broker: ["open", "pending_client", "resolved", "closed"],
  pending_client: ["open", "pending_broker", "resolved", "closed"],
  resolved: ["open", "pending_broker", "closed"],
  closed: [],
};

export function isThreadStatus(value: unknown): value is ThreadStatus {
  return typeof value === "string" && (THREAD_STATUSES as readonly string[]).includes(value);
}

export function isThreadClosed(status: string): boolean {
  return status === "closed";
}

export function canThreadTransition(from: string, to: string): boolean {
  if (!isThreadStatus(from) || !isThreadStatus(to)) return false;
  if (from === to) return true;
  return transitions[from].includes(to);
}

export function assertThreadTransition(from: string, to: string): void {
  if (!canThreadTransition(from, to)) throw new InvalidThreadTransitionError(from, to);
}

export function availableThreadStatuses(from: string): ThreadStatus[] {
  return isThreadStatus(from) ? [...transitions[from]] : [];
}

/** A closed conversation accepts no further messages from either side. */
export function assertThreadOpenForMessage(status: string): void {
  if (isThreadClosed(status)) {
    throw new Response("This conversation is closed. Start a new one to continue.", { status: 409 });
  }
}

/**
 * Where a conversation lands after a message is posted.
 * - An investor message needs the broker → `pending_broker`, and reopens a
 *   resolved conversation.
 * - A broker reply hands it back to the investor → `pending_client`.
 * - A `system` message (used by internal notes) never changes status, so adding
 *   an internal note cannot produce a state change the investor would notice.
 */
export function statusAfterMessage(current: string, authorType: "broker" | "investor" | "system"): ThreadStatus {
  const status = isThreadStatus(current) ? current : "open";
  if (authorType === "system") return status;
  if (status === "closed") return status;
  return authorType === "investor" ? "pending_broker" : "pending_client";
}
