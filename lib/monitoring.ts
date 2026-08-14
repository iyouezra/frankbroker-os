import { createHash } from "node:crypto";

export type MonitoringSeverity = "low" | "medium" | "high" | "critical";

export const MONITORING_RULES = {
  AML_P1: { category: "aml", title: "Third-party or unverified funding source", severity: "high", configuration: {} },
  AML_P4: { category: "aml", title: "Deposit fragmentation", severity: "medium", configuration: { count: 3, windowDays: 7 } },
  AML_P5: { category: "aml", title: "Historical cash deviation", severity: "medium", configuration: { clientAgeDays: 180, minimumMovements: 10, minimumDirectionObservations: 5, multiplier: 5, lookbackDays: 365 } },
  AML_P7: { category: "aml", title: "Shared verified identifiers", severity: "high", configuration: {} },
  AML_P8_KYC: { category: "aml", title: "KYC or screening review overdue", severity: "high", configuration: { screeningStaleDays: 365 } },
  AML_P8_SCREENING: { category: "aml", title: "Screening match", severity: "critical", configuration: {} },
  AML_P9_FIRST_WITHDRAWAL: { category: "aml", title: "Rapid first withdrawal", severity: "medium", configuration: { windowDays: 7 } },
  AML_P9_UNFUNDED_DESTINATION: { category: "aml", title: "Withdrawal to an unfunded destination", severity: "high", configuration: {} },
  EC_MISSING_CLEARANCE: { category: "employee_conduct", title: "Employee trade without valid clearance", severity: "high", configuration: {} },
  EC_RESTRICTED_SECURITY: { category: "employee_conduct", title: "Restricted-security trade attempt", severity: "critical", configuration: {} },
  EC_INSIDE_INFORMATION: { category: "employee_conduct", title: "Trade attempt while holding sensitive information", severity: "critical", configuration: {} },
  EC_FRONT_RUNNING: { category: "employee_conduct", title: "Potential employee front-running", severity: "high", configuration: { businessDayWindow: 1 } },
  EC_ACTIVE_OVERLAP: { category: "employee_conduct", title: "Employee order overlaps active client interest", severity: "medium", configuration: {} },
  EC_PROFILE_MISSING: { category: "employee_conduct", title: "Employee conduct profile missing", severity: "medium", configuration: {} },
  EC_ACCOUNT_UNLINKED: { category: "employee_conduct", title: "Employee account linkage incomplete", severity: "medium", configuration: {} },
  EC_ATTESTATION_OVERDUE: { category: "employee_conduct", title: "Annual conduct attestation overdue", severity: "medium", configuration: {} },
  EC_CLEARANCE_EXCEPTION: { category: "employee_conduct", title: "Clearance remains open for inactive employee", severity: "high", configuration: {} },
  EC_CANCELLATION_PATTERN: { category: "employee_conduct", title: "Repeated employee order cancellations", severity: "medium", configuration: { count: 3, windowDays: 7 } },
} as const;

export const PRE_CLEARANCE_ROLES = new Set(["broker_admin", "trader", "operations", "settlement", "compliance", "management", "advisory_lead", "advisory_analyst"]);

export function requiresEmployeePreclearance(role: string, designatedSensitiveAccess = false) {
  return PRE_CLEARANCE_ROLES.has(role) || designatedSensitiveAccess;
}

export type MonitoringRuleCode = keyof typeof MONITORING_RULES;

export function severityRank(severity: MonitoringSeverity) {
  return ["low", "medium", "high", "critical"].indexOf(severity);
}

export function raiseSeverity(severity: MonitoringSeverity): MonitoringSeverity {
  return (["medium", "high", "critical", "critical"] as MonitoringSeverity[])[severityRank(severity)] ?? severity;
}

export function appliesHighRiskMultiplier(client: { pepStatus?: string | null; riskRating?: string | null; kycStatus?: string | null }) {
  const pep = (client.pepStatus ?? "").toLowerCase();
  const risk = (client.riskRating ?? "").toLowerCase();
  const kyc = (client.kycStatus ?? "").toLowerCase();
  return ["pep", "pep_related", "related_to_pep", "related"].includes(pep) || ["enhanced", "high", "review"].includes(risk) || kyc.includes("review");
}

export function normalizeVerifiedPhone(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("251")) return digits;
  if (digits.startsWith("0")) return `251${digits.slice(1)}`;
  return digits.length === 9 ? `251${digits}` : digits;
}

export function taxIdentityReference(tin: string) {
  const normalized = tin.replace(/\s+/g, "").toUpperCase();
  return createHash("sha256").update(`tin:${normalized}`).digest("hex");
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function historicalDeviation(input: { amount: number; completedMovementCount: number; sameDirectionAmounts: number[]; clientCreatedAt: Date; now?: Date; clientAgeDays?: number; minimumMovements?: number; minimumDirectionObservations?: number; multiplier?: number }) {
  const now = input.now ?? new Date();
  const ageDays = (now.getTime() - input.clientCreatedAt.getTime()) / 86_400_000;
  if (ageDays < (input.clientAgeDays ?? 180) || input.completedMovementCount < (input.minimumMovements ?? 10) || input.sameDirectionAmounts.length < (input.minimumDirectionObservations ?? 5)) return null;
  const baseline = median(input.sameDirectionAmounts);
  if (!baseline || input.amount < baseline * (input.multiplier ?? 5)) return null;
  return { baseline, multiple: input.amount / baseline };
}

export function validDepositFundingSource(input: { sourceBankStatus?: string | null; sourceBankClientId?: string | null; movementClientId: string }) {
  return input.sourceBankStatus === "approved" && input.sourceBankClientId === input.movementClientId;
}

export function fragmentationTriggered(nonRejectedDepositCount: number, configuredCount = 3) {
  return configuredCount > 0 && nonRejectedDepositCount >= configuredCount;
}

export function closedLoopWithdrawalRisk(input: { destinationFunded: boolean; hasPriorWithdrawal: boolean; clientAgeDays: number; firstWithdrawalWindowDays?: number }) {
  return {
    unfundedDestination: !input.destinationFunded,
    rapidFirstWithdrawal: !input.hasPriorWithdrawal && input.clientAgeDays <= (input.firstWithdrawalWindowDays ?? 7),
  };
}

export function personalClearanceCovers(input: { present: boolean; quantity: number; value: number; maxQuantity?: number | null; maxValue?: number | null }) {
  return input.present && (input.maxQuantity == null || input.quantity <= input.maxQuantity) && (input.maxValue == null || input.value <= input.maxValue);
}

export function cancellationPatternTriggered(cancelledOrderCount: number, configuredCount = 3) {
  return configuredCount > 0 && cancelledOrderCount >= configuredCount;
}

export function isImmediateEmployeeConductRule(ruleCode: MonitoringRuleCode) {
  return ["EC_RESTRICTED_SECURITY", "EC_INSIDE_INFORMATION", "EC_FRONT_RUNNING"].includes(ruleCode);
}

export function isAttestationOverdue(input: { dueAt?: Date | null; attestedYears: number[]; now?: Date }) {
  const now = input.now ?? new Date();
  if (!input.dueAt || input.dueAt >= now) return false;
  return !input.attestedYears.includes(input.dueAt.getUTCFullYear());
}

export function isMonitoringEnabled(features: unknown) {
  return Boolean(features && typeof features === "object" && !Array.isArray(features) && (features as Record<string, unknown>).riskComplianceMonitoring === true);
}

export function addisBusinessDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function activeOnDate(input: { effectiveFrom: Date; effectiveTo: Date | null }, at = new Date()) {
  return input.effectiveFrom <= at && (!input.effectiveTo || input.effectiveTo > at);
}
