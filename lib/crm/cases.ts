/**
 * Complaints and formal service cases. Pure and browser-safe. Kept deliberately
 * small: enough structure for accountable handling and an audit trail, with room
 * to grow toward SLA and regulatory reporting without a schema change.
 */

export const CASE_STATUSES = ["new", "assigned", "under_review", "awaiting_investor", "resolved", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  new: "New",
  assigned: "Assigned",
  under_review: "Under review",
  awaiting_investor: "Awaiting investor",
  resolved: "Resolved",
  closed: "Closed",
};

export const OPEN_CASE_STATUSES: CaseStatus[] = ["new", "assigned", "under_review", "awaiting_investor"];

export const CASE_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type CaseSeverity = (typeof CASE_SEVERITIES)[number];

export const CASE_CATEGORIES = ["complaint", "service_failure", "data_correction", "fees", "other"] as const;

export class InvalidCaseTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`A service case cannot move from ${from} to ${to}.`);
    this.name = "InvalidCaseTransitionError";
  }
}

/** `closed` is terminal; a resolved case may be reopened for review if the investor pushes back. */
const transitions: Record<CaseStatus, readonly CaseStatus[]> = {
  new: ["assigned", "under_review", "awaiting_investor", "resolved", "closed"],
  assigned: ["under_review", "awaiting_investor", "resolved", "closed"],
  under_review: ["assigned", "awaiting_investor", "resolved", "closed"],
  awaiting_investor: ["under_review", "assigned", "resolved", "closed"],
  resolved: ["under_review", "closed"],
  closed: [],
};

export function isCaseStatus(value: unknown): value is CaseStatus {
  return typeof value === "string" && (CASE_STATUSES as readonly string[]).includes(value);
}

export function isCaseSeverity(value: unknown): value is CaseSeverity {
  return typeof value === "string" && (CASE_SEVERITIES as readonly string[]).includes(value);
}

export function canCaseTransition(from: string, to: string): boolean {
  if (!isCaseStatus(from) || !isCaseStatus(to)) return false;
  if (from === to) return true;
  return transitions[from].includes(to);
}

export function assertCaseTransition(from: string, to: string): void {
  if (!canCaseTransition(from, to)) throw new InvalidCaseTransitionError(from, to);
}

export function availableCaseStatuses(from: string): CaseStatus[] {
  return isCaseStatus(from) ? [...transitions[from]] : [];
}

export function isCaseOpen(status: string): boolean {
  return (OPEN_CASE_STATUSES as string[]).includes(status);
}

/** Severity drives the target resolution window; the clock is informational for now. */
export const RESOLUTION_DAYS: Record<CaseSeverity, number> = { critical: 2, high: 5, medium: 10, low: 20 };

export function targetResolutionDate(severity: string, openedAt: Date = new Date()): Date {
  const days = RESOLUTION_DAYS[(isCaseSeverity(severity) ? severity : "medium")];
  return new Date(openedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isCaseOverdue(
  serviceCase: { status: string; targetResolutionAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (!serviceCase.targetResolutionAt || !isCaseOpen(serviceCase.status)) return false;
  const target = typeof serviceCase.targetResolutionAt === "string" ? new Date(serviceCase.targetResolutionAt) : serviceCase.targetResolutionAt;
  return target.getTime() < now.getTime();
}

export function severityTone(severity: string): "danger" | "warning" | "brand" | "neutral" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  if (severity === "medium") return "brand";
  return "neutral";
}

function reject(message: string): never {
  throw new Response(message, { status: 400 });
}

export function parseSeverity(value: unknown, fallback: CaseSeverity = "medium"): CaseSeverity {
  if (value === undefined || value === null || value === "") return fallback;
  if (!isCaseSeverity(value)) reject("Select a valid severity.");
  return value;
}

export function parseCaseCategory(value: unknown, fallback = "complaint"): string {
  if (value === undefined || value === null || value === "") return fallback;
  const category = String(value);
  if (!(CASE_CATEGORIES as readonly string[]).includes(category)) reject("Select a valid case category.");
  return category;
}

export function parseFindings(value: unknown): string | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const findings = String(value).trim();
  if (findings.length > 4000) reject("Internal findings must be 4000 characters or fewer.");
  return findings;
}

export function parseResolutionSummary(value: unknown): string {
  const summary = String(value ?? "").trim();
  if (summary.length < 10 || summary.length > 4000) {
    reject("A resolution summary between 10 and 4000 characters is required.");
  }
  return summary;
}
