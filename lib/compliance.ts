export const COMPLIANCE_REPORT_TYPES = ["monthly_transactions", "quarterly_complaints"] as const;
export type ComplianceReportType = (typeof COMPLIANCE_REPORT_TYPES)[number];

export const COMPLIANCE_REPORT_LABELS: Record<ComplianceReportType, string> = {
  monthly_transactions: "ECMA monthly transaction report",
  quarterly_complaints: "ECMA quarterly complaints report",
};

export const COMPLIANCE_ESCALATION_TYPES = [
  "market_conduct",
  "threshold_dealing",
  "regulatory_breach",
  "material_event",
] as const;
export type ComplianceEscalationType = (typeof COMPLIANCE_ESCALATION_TYPES)[number];

export const COMPLIANCE_ESCALATION_LABELS: Record<ComplianceEscalationType, string> = {
  market_conduct: "Suspected market conduct",
  threshold_dealing: "Above-threshold dealing",
  regulatory_breach: "Regulatory breach",
  material_event: "Material event",
};

export const SCREENING_RESULTS = ["clear", "potential_match", "confirmed_match"] as const;

export function completedReportPeriod(type: ComplianceReportType, today = new Date()) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const periodEnd = type === "monthly_transactions"
    ? new Date(Date.UTC(year, month, 0))
    : new Date(Date.UTC(year, Math.floor(month / 3) * 3, 0));
  const periodStart = type === "monthly_transactions"
    ? new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1))
    : new Date(Date.UTC(periodEnd.getUTCFullYear(), Math.floor(periodEnd.getUTCMonth() / 3) * 3, 1));
  return {
    from: periodStart.toISOString().slice(0, 10),
    to: periodEnd.toISOString().slice(0, 10),
  };
}

export function isComplianceReportType(value: unknown): value is ComplianceReportType {
  return typeof value === "string" && (COMPLIANCE_REPORT_TYPES as readonly string[]).includes(value);
}

export function isComplianceEscalationType(value: unknown): value is ComplianceEscalationType {
  return typeof value === "string" && (COMPLIANCE_ESCALATION_TYPES as readonly string[]).includes(value);
}

export function isScreeningResult(value: unknown): value is (typeof SCREENING_RESULTS)[number] {
  return typeof value === "string" && (SCREENING_RESULTS as readonly string[]).includes(value);
}

export function isDomesticInvestor(countryOfResidence: string | null, nationality: string | null): boolean | null {
  const value = (countryOfResidence || nationality || "").trim().toLowerCase();
  if (!value) return null;
  return ["ethiopia", "ethiopian", "et", "eth"].includes(value);
}

export function investorCategory(clientType: string): "retail" | "institutional" {
  return clientType.trim().toLowerCase() === "individual" ? "retail" : "institutional";
}

export function ecmaInstrumentCategory(assetClass: string): string | null {
  const value = assetClass.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (["equity", "equities", "share", "shares", "stock"].includes(value)) return "Equity (Shares)";
  if (["fixed_income", "bond", "bonds", "treasury_bill", "treasury_bond"].includes(value)) return "Fixed Income";
  if (["etf", "etfs", "etp", "etps"].includes(value)) return "ETFs/ETPs";
  if (["reit", "reits", "real_estate_investment_trust"].includes(value)) return "REITS";
  return null;
}

export function complaintRegulatoryStatus(input: { status: string; regulatoryStatus?: string | null }) {
  if (input.regulatoryStatus === "referred_sro") return "Referred to SRO";
  if (input.regulatoryStatus === "referred_ecma") return "Referred to ECMA";
  if (input.status === "resolved") return "Resolved";
  if (input.status === "closed") return "Closed";
  return "Pending";
}

export function twentyFourHourDueAt(awarenessAt: Date): Date {
  return new Date(awarenessAt.getTime() + 24 * 60 * 60 * 1000);
}

export function parseReportingDate(value: unknown, label: string): Date {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Response(`${label} must be a valid date.`, { status: 400 });
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Response(`${label} must be a valid date.`, { status: 400 });
  return date;
}

export function reportPeriod(start: unknown, end: unknown) {
  const periodStart = parseReportingDate(start, "Period start");
  const periodEnd = parseReportingDate(end, "Period end");
  if (periodEnd < periodStart) throw new Response("Period end must be on or after period start.", { status: 400 });
  const days = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86_400_000) + 1;
  if (days > 370) throw new Response("A reporting period cannot exceed 370 days.", { status: 400 });
  return { periodStart, periodEnd };
}

export function assertPrescribedReportPeriod(type: ComplianceReportType, periodStart: Date, periodEnd: Date) {
  if (type === "monthly_transactions") {
    const expectedEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0));
    if (periodStart.getUTCDate() !== 1 || periodEnd.getTime() !== expectedEnd.getTime()) {
      throw new Response("The monthly transaction return must cover one complete calendar month.", { status: 400 });
    }
    return;
  }
  const expectedEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 3, 0));
  if (periodStart.getUTCDate() !== 1 || periodStart.getUTCMonth() % 3 !== 0 || periodEnd.getTime() !== expectedEnd.getTime()) {
    throw new Response("The quarterly complaints return must cover one complete calendar quarter.", { status: 400 });
  }
}
