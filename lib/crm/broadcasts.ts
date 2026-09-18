/** Shared broadcast vocabulary and validation; safe to import in the UI. */
export const BROADCAST_SEGMENTS = {
  all: "All clients",
  retail: "Retail clients",
  institutions: "Institutional / corporate clients",
  holders: "Holders of a security",
  event_entitlements: "Clients entitled to an event",
} as const;
export type BroadcastSegment = keyof typeof BROADCAST_SEGMENTS;
export type BroadcastInput = {
  subject: string; body: string; segment: BroadcastSegment; channel: "in_app";
  instrumentId: string; corporateActionId: string; eventName: string;
};
export type BroadcastSummary = {
  id: string; subject: string; body: string; segment: string; contextLabel: string | null;
  channel: string; recipientCount: number; delivered: number; read: number; sentAt: string;
};
export type BroadcastRecipient = { threadId: string; clientId: string; name: string; code: string; deliveredAt: string | null; readAt: string | null };
export type BroadcastOptions = {
  instruments: Array<{ id: string; label: string }>;
  events: Array<{ id: string; instrumentId: string; label: string }>;
};
export type AudiencePreview = { count: number; token: string; contextLabel: string | null; sample: Array<{ id: string; fullName: string; clientCode: string }> };

export function parseBroadcastInput(raw: Record<string, unknown>): BroadcastInput {
  const text = (key: string, max: number) => {
    const value = raw[key] == null ? "" : raw[key];
    if (typeof value !== "string" || value.length > max) throw new Response(`Invalid ${key}.`, { status: 400 });
    return value.trim();
  };
  const subject = text("subject", 160), body = text("body", 4000);
  if (subject.length < 4 || body.length < 2) throw new Response("Add a subject (4–160 characters) and a message (2–4,000 characters).", { status: 400 });
  if (typeof raw.segment !== "string" || !Object.hasOwn(BROADCAST_SEGMENTS, raw.segment)) throw new Response("Choose an audience.", { status: 400 });
  if (raw.channel !== "in_app") throw new Response("Only in-app delivery is connected. SMS and email are not configured for broadcasts.", { status: 400 });
  const instrumentId = text("instrumentId", 100), corporateActionId = text("corporateActionId", 100), eventName = text("eventName", 160);
  if (raw.segment === "holders" && !instrumentId && !corporateActionId) throw new Response("Choose a security for the holders segment.", { status: 400 });
  if (raw.segment === "event_entitlements" && !corporateActionId) throw new Response("Choose a corporate-action event.", { status: 400 });
  if (eventName && corporateActionId) throw new Response("Choose an existing event or name a new event, not both.", { status: 400 });
  return { subject, body, segment: raw.segment as BroadcastSegment, channel: "in_app", instrumentId, corporateActionId, eventName };
}

/** Sent is an accepted record; delivered means stored in the recipient's inbox,
 * not delivered to a handset. Read is an explicit acknowledgement of displayed IDs. */
export function messageReceipt(message: { deliveredAt?: unknown; readAt?: unknown }) {
  return message.readAt ? "read" : message.deliveredAt ? "delivered" : "sent";
}

export function parseReadMessageIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some((id) => typeof id !== "string" || !id || id.length > 100)) {
    throw new Response("Provide the displayed message IDs (up to 100).", { status: 400 });
  }
  return [...new Set(value)] as string[];
}
