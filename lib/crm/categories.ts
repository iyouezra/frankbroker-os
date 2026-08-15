/**
 * Vocabulary for investor-servicing conversations. Pure and browser-safe so both
 * portals and the tests can import it. Values are plain strings to match the
 * project's zero-Prisma-enum convention.
 */

export const THREAD_CATEGORIES = [
  "general",
  "order",
  "cash",
  "kyc",
  "portfolio",
  "complaint",
  "call_request",
  "other",
] as const;
export type ThreadCategory = (typeof THREAD_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ThreadCategory, string> = {
  general: "General account support",
  order: "Order enquiry",
  cash: "Deposit or withdrawal",
  kyc: "KYC and documentation",
  portfolio: "Portfolio enquiry",
  complaint: "Complaint",
  call_request: "Call request",
  other: "Other",
};

export const THREAD_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ThreadPriority = (typeof THREAD_PRIORITIES)[number];

/**
 * Platform records a conversation may point at. Whitelisted so a caller cannot
 * fabricate a link to an arbitrary table; the service additionally verifies the
 * referenced row belongs to the same tenant and client.
 */
export const RELATED_TYPES = [
  "order",
  "trade",
  "cash_movement",
  "service_request",
  "document",
  "account",
  "kyc",
] as const;
export type RelatedType = (typeof RELATED_TYPES)[number];

export const RELATED_TYPE_LABELS: Record<RelatedType, string> = {
  order: "Order",
  trade: "Trade",
  cash_movement: "Cash instruction",
  service_request: "Client instruction",
  document: "Document",
  account: "Account",
  kyc: "KYC review",
};

export function isThreadCategory(value: unknown): value is ThreadCategory {
  return typeof value === "string" && (THREAD_CATEGORIES as readonly string[]).includes(value);
}

export function isThreadPriority(value: unknown): value is ThreadPriority {
  return typeof value === "string" && (THREAD_PRIORITIES as readonly string[]).includes(value);
}

export function isRelatedType(value: unknown): value is RelatedType {
  return typeof value === "string" && (RELATED_TYPES as readonly string[]).includes(value);
}

/** Maps an existing ClientServiceRequest.requestType onto a conversation category. */
export function categoryForServiceRequest(requestType: string): ThreadCategory {
  if (requestType === "trade_discrepancy") return "order";
  if (["account_closure", "profile_correction", "tax_document", "security_concern"].includes(requestType)) return "general";
  return "other";
}

/** Tone names that map onto the existing global `.status-*` classes - no new CSS. */
export function priorityTone(priority: string): "danger" | "warning" | "brand" | "neutral" {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  if (priority === "normal") return "brand";
  return "neutral";
}

function reject(message: string): never {
  throw new Response(message, { status: 400 });
}

export function parseSubject(value: unknown): string {
  const subject = String(value ?? "").trim();
  if (subject.length < 4 || subject.length > 160) {
    reject("A subject between 4 and 160 characters is required.");
  }
  return subject;
}

export function parseBody(value: unknown): string {
  const body = String(value ?? "").trim();
  if (body.length < 2 || body.length > 4000) {
    reject("A message between 2 and 4000 characters is required.");
  }
  return body;
}

export function parseCategory(value: unknown): ThreadCategory {
  if (!isThreadCategory(value)) reject("Select a valid conversation category.");
  return value;
}

export function parsePriority(value: unknown, fallback: ThreadPriority = "normal"): ThreadPriority {
  if (value === undefined || value === null || value === "") return fallback;
  if (!isThreadPriority(value)) reject("Select a valid priority.");
  return value;
}

/** Related links are optional; both parts must be present together to be stored. */
export function parseRelated(type: unknown, id: unknown): { relatedType: RelatedType | null; relatedId: string | null } {
  const hasType = type !== undefined && type !== null && type !== "";
  const hasId = id !== undefined && id !== null && String(id).trim() !== "";
  if (!hasType && !hasId) return { relatedType: null, relatedId: null };
  if (!hasType || !hasId) reject("A related record needs both a type and a reference.");
  if (!isRelatedType(type)) reject("That related record type is not supported.");
  const relatedId = String(id).trim();
  if (relatedId.length > 64) reject("The related record reference is too long.");
  return { relatedType: type, relatedId };
}
