import { Prisma } from "../app/generated/prisma/client";
import {
  COMPLIANCE_REPORT_TYPES,
  COMPLIANCE_REPORT_LABELS,
  assertPrescribedReportPeriod,
  complaintRegulatoryStatus,
  ecmaInstrumentCategory,
  investorCategory,
  isComplianceEscalationType,
  isComplianceReportType,
  isDomesticInvestor,
  isScreeningResult,
  reportPeriod,
  twentyFourHourDueAt,
  type ComplianceReportType,
} from "./compliance";
import { COMPLIANCE_PERMISSIONS } from "./frank";
import { D, toNum } from "./money";
import { writeAudit } from "./oms/audit-service";
import { prisma } from "./prisma";
import type { Actor } from "./server-auth";

export type ReportValidation = { blocking: string[]; notices: string[] };
export type MonthlyTransactionRow = {
  category: string;
  domesticRetail: number;
  domesticInstitutional: number;
  foreignRetail: number;
  foreignInstitutional: number;
};
export type MonthlyTransactionSnapshot = {
  kind: "monthly_transactions";
  brokerName: string;
  licenseNumber: string;
  month: string;
  year: number;
  rows: MonthlyTransactionRow[];
  includedTrades: number;
};
export type ComplaintDetail = {
  id: string;
  complainant: string;
  complainantCategory: string;
  type: "Brought Forward" | "New";
  dateReceived: string;
  details: string;
  status: string;
  statusDate: string | null;
  comment: string;
};
export type ComplaintsSnapshot = {
  kind: "quarterly_complaints";
  brokerName: string;
  licenseNumber: string;
  licenseTypes?: string[];
  quarter: string;
  year: number;
  summary: {
    broughtForward: number;
    newComplaints: number;
    totalUnderReview: number;
    resolved: number;
    referredSro: number;
    referredEcma: number;
    closed: number;
    pending: number;
  };
  complaints: ComplaintDetail[];
};
export type ClientStatementSnapshot = {
  kind: "client_statement";
  brokerName: string;
  licenseNumber: string;
  client: { id: string; code: string; name: string; accountNumber: string; currency: string };
  periodStart: string;
  periodEnd: string;
  openingCash: number;
  closingCash: number;
  transactions: Array<{ date: string; type: string; reference: string; debit: number; credit: number; runningBalance: number; description: string }>;
  trades: Array<{ tradeId: string; orderId: string; tradeDate: string; symbol: string; side: string; quantity: number; price: number; gross: number; fees: number; net: number; settlementDate: string }>;
  holdings: Array<{ symbol: string; name: string; quantity: number }>;
};
export type ComplianceSnapshot = MonthlyTransactionSnapshot | ComplaintsSnapshot | ClientStatementSnapshot;

const reportInclude = {
  preparer: { select: { fullName: true } },
  reviewer: { select: { fullName: true } },
  submitter: { select: { fullName: true } },
  client: { select: { fullName: true, clientCode: true } },
} satisfies Prisma.ComplianceReportInclude;

type ReportRow = Prisma.ComplianceReportGetPayload<{ include: typeof reportInclude }>;

export function serializeComplianceReport(row: ReportRow) {
  const validation = row.validation as unknown as ReportValidation;
  return {
    id: row.id,
    reportType: row.reportType,
    name: row.reportType === "client_statement" ? "Client account statement" : COMPLIANCE_REPORT_LABELS[row.reportType as ComplianceReportType] ?? row.reportType,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    status: row.status,
    blockingIssues: validation.blocking?.length ?? 0,
    notices: validation.notices?.length ?? 0,
    validation: { blocking: validation.blocking ?? [], notices: validation.notices ?? [] },
    snapshot: row.snapshot as unknown as ComplianceSnapshot,
    preparedBy: row.preparer.fullName,
    reviewedBy: row.reviewer?.fullName ?? null,
    submittedBy: row.submitter?.fullName ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    submissionReference: row.submissionReference,
    client: row.client ? { name: row.client.fullName, code: row.client.clientCode } : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function brokerProfile(actor: Pick<Actor, "brokerId">) {
  const broker = await prisma.broker.findUnique({
    where: { id: actor.brokerId },
    include: {
      settings: { select: { tradingName: true } },
      tenantProfile: { select: { businessType: true } },
      tenantLicenses: { select: { regulator: true, licenseType: true, status: true } },
    },
  });
  if (!broker) throw new Response("Broker tenant not found.", { status: 404 });
  const labelLicense = (value: string) => value
    .trim()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const configuredTypes = broker.tenantLicenses
    .filter((license) => license.regulator.trim().toUpperCase() === "ECMA" && license.status === "active")
    .map((license) => labelLicense(license.licenseType));
  const licenseTypes = [...new Set(configuredTypes.length ? configuredTypes : [labelLicense(broker.tenantProfile?.businessType ?? "securities_broker")])];
  return { brokerName: broker.settings?.tradingName ?? broker.name, licenseNumber: broker.licenseNumber, licenseTypes };
}

function dateAtEndOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

async function monthlyTransactionSnapshot(actor: Actor, periodStart: Date, periodEnd: Date) {
  const broker = await brokerProfile(actor);
  const profile = { brokerName: broker.brokerName, licenseNumber: broker.licenseNumber };
  const trades = await prisma.trade.findMany({
    where: {
      tradeDate: { gte: periodStart, lte: periodEnd },
      order: { brokerId: actor.brokerId },
    },
    include: {
      order: {
        include: {
          instrument: { select: { assetClass: true } },
          account: { include: { client: { select: { id: true, clientCode: true, clientType: true, nationality: true, countryOfResidence: true } } } },
        },
      },
    },
    orderBy: [{ tradeDate: "asc" }, { capturedAt: "asc" }],
  });

  const categories = ["Equity (Shares)", "Fixed Income", "ETFs/ETPs", "REITS", "Placeholder", "Placeholder", "Placeholder", "Placeholder", "Placeholder", "Placeholder"];
  const rows = categories.map((category) => ({ category, domesticRetail: D(0), domesticInstitutional: D(0), foreignRetail: D(0), foreignInstitutional: D(0) }));
  const validation: ReportValidation = { blocking: [], notices: [] };
  const seenIssues = new Set<string>();
  let includedTrades = 0;

  for (const trade of trades) {
    const category = ecmaInstrumentCategory(trade.order.instrument.assetClass);
    const client = trade.order.account.client;
    const domestic = isDomesticInvestor(client.countryOfResidence, client.nationality);
    if (!category) {
      const issue = `${trade.id}: ${trade.order.instrument.assetClass || "missing asset class"} is not mapped to an ECMA transaction category.`;
      if (!seenIssues.has(issue)) validation.blocking.push(issue);
      seenIssues.add(issue);
      continue;
    }
    if (domestic === null) {
      const issue = `${client.clientCode}: country of residence or nationality is required for domestic or foreign classification.`;
      if (!seenIssues.has(issue)) validation.blocking.push(issue);
      seenIssues.add(issue);
      continue;
    }
    const row = rows.find((item) => item.category === category)!;
    const categoryOfInvestor = investorCategory(client.clientType);
    const amount = trade.grossAmount;
    if (domestic && categoryOfInvestor === "retail") row.domesticRetail = row.domesticRetail.plus(amount);
    else if (domestic) row.domesticInstitutional = row.domesticInstitutional.plus(amount);
    else if (categoryOfInvestor === "retail") row.foreignRetail = row.foreignRetail.plus(amount);
    else row.foreignInstitutional = row.foreignInstitutional.plus(amount);
    includedTrades += 1;
  }

  if (!trades.length) validation.notices.push("No executed trades were found for the selected reporting period.");
  const snapshot: MonthlyTransactionSnapshot = {
    kind: "monthly_transactions",
    ...profile,
    month: periodStart.toLocaleString("en-US", { month: "long", timeZone: "UTC" }),
    year: periodStart.getUTCFullYear(),
    rows: rows.map((row) => ({
      category: row.category,
      domesticRetail: toNum(row.domesticRetail),
      domesticInstitutional: toNum(row.domesticInstitutional),
      foreignRetail: toNum(row.foreignRetail),
      foreignInstitutional: toNum(row.foreignInstitutional),
    })),
    includedTrades,
  };
  return { snapshot, validation };
}

function quarterLabel(date: Date) {
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

async function complaintsSnapshot(actor: Actor, periodStart: Date, periodEnd: Date) {
  const profile = await brokerProfile(actor);
  const rows = await prisma.serviceCase.findMany({
    where: {
      brokerId: actor.brokerId,
      category: "complaint",
      openedAt: { lte: dateAtEndOfDay(periodEnd) },
      OR: [
        { resolvedAt: null },
        { resolvedAt: { gte: periodStart } },
        { closedAt: { gte: periodStart } },
      ],
    },
    include: { client: { select: { fullName: true, clientType: true } } },
    orderBy: { openedAt: "asc" },
  });
  const complaints = rows.map((row): ComplaintDetail => {
    const status = complaintRegulatoryStatus(row);
    const statusDate = row.regulatoryStatusAt ?? (status === "Resolved" ? row.resolvedAt : status === "Closed" ? row.closedAt : null);
    return {
      id: row.id,
      complainant: row.client.fullName,
      complainantCategory: investorCategory(row.client.clientType) === "retail" ? "Retail" : "Institutional",
      type: row.openedAt < periodStart ? "Brought Forward" : "New",
      dateReceived: row.openedAt.toISOString().slice(0, 10),
      details: row.subject,
      status,
      statusDate: statusDate?.toISOString().slice(0, 10) ?? null,
      comment: row.regulatoryComment ?? row.resolutionSummary ?? row.internalFindings ?? "",
    };
  });
  const count = (status: string) => complaints.filter((item) => item.status === status).length;
  const broughtForward = complaints.filter((item) => item.type === "Brought Forward").length;
  const newComplaints = complaints.filter((item) => item.type === "New").length;
  const summary = {
    broughtForward,
    newComplaints,
    totalUnderReview: broughtForward + newComplaints,
    resolved: count("Resolved"),
    referredSro: count("Referred to SRO"),
    referredEcma: count("Referred to ECMA"),
    closed: count("Closed"),
    pending: count("Pending"),
  };
  const validation: ReportValidation = { blocking: [], notices: [] };
  if (!complaints.length) validation.notices.push("No complaints were reportable for the selected quarter.");
  const snapshot: ComplaintsSnapshot = {
    kind: "quarterly_complaints",
    ...profile,
    quarter: quarterLabel(periodStart),
    year: periodStart.getUTCFullYear(),
    summary,
    complaints,
  };
  return { snapshot, validation };
}

export async function listComplianceReports(actor: Actor) {
  const rows = await prisma.complianceReport.findMany({
    where: { brokerId: actor.brokerId, reportType: { in: [...COMPLIANCE_REPORT_TYPES] } },
    include: reportInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((row) => ({
    ...serializeComplianceReport(row),
    reviewAvailable: row.status === "prepared" && row.preparedBy !== actor.id,
    reviewBlocker: row.status === "prepared" && row.preparedBy === actor.id
      ? "Four-eyes control: switch to a different authorized reviewer."
      : null,
  }));
}

export async function prepareComplianceReport(actor: Actor, input: { reportType?: unknown; periodStart?: unknown; periodEnd?: unknown }) {
  if (!isComplianceReportType(input.reportType)) throw new Response("Select a supported ECMA report.", { status: 400 });
  const { periodStart, periodEnd } = reportPeriod(input.periodStart, input.periodEnd);
  assertPrescribedReportPeriod(input.reportType, periodStart, periodEnd);
  const built = input.reportType === "monthly_transactions"
    ? await monthlyTransactionSnapshot(actor, periodStart, periodEnd)
    : await complaintsSnapshot(actor, periodStart, periodEnd);
  const id = `RPT-${crypto.randomUUID().slice(0, 10).toUpperCase()}`;
  const status = built.validation.blocking.length ? "needs_attention" : "prepared";
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.complianceReport.create({
      data: {
        id,
        brokerId: actor.brokerId,
        reportType: input.reportType as ComplianceReportType,
        periodStart,
        periodEnd,
        status,
        snapshot: built.snapshot as unknown as Prisma.InputJsonValue,
        validation: built.validation as unknown as Prisma.InputJsonValue,
        preparedBy: actor.id,
      },
      include: reportInclude,
    });
    await writeAudit(tx, {
      brokerId: actor.brokerId,
      actorId: actor.id,
      action: "COMPLIANCE_REPORT_PREPARED",
      entityType: "compliance_report",
      entityId: id,
      summary: `${COMPLIANCE_REPORT_LABELS[input.reportType as ComplianceReportType]} prepared for ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`,
      newValue: { reportType: input.reportType, status, validation: built.validation },
    });
    return created;
  });
  return serializeComplianceReport(row);
}

async function reportForActor(actor: Actor, id: string) {
  const row = await prisma.complianceReport.findFirst({ where: { id, brokerId: actor.brokerId }, include: reportInclude });
  if (!row) throw new Response("Report not found for this tenant.", { status: 404 });
  return row;
}

export async function getComplianceReport(actor: Actor, id: string) {
  return reportForActor(actor, id);
}

export async function reviewComplianceReport(actor: Actor, id: string) {
  const row = await reportForActor(actor, id);
  if (row.status !== "prepared") throw new Response("Only a complete prepared report can be reviewed.", { status: 409 });
  if (row.preparedBy === actor.id) throw new Response("Four-eyes control: the report preparer cannot review the same report.", { status: 409 });
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.complianceReport.update({ where: { id }, data: { status: "reviewed", reviewedBy: actor.id, reviewedAt: new Date() }, include: reportInclude });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "COMPLIANCE_REPORT_REVIEWED", entityType: "compliance_report", entityId: id, summary: `${id} reviewed and approved for broker submission`, previousValue: { status: row.status }, newValue: { status: "reviewed" } });
    return next;
  });
  return serializeComplianceReport(updated);
}

export async function recordComplianceSubmission(actor: Actor, id: string, reference: unknown, note: unknown) {
  const row = await reportForActor(actor, id);
  if (row.status !== "reviewed") throw new Response("Review the report before recording submission.", { status: 409 });
  const submissionReference = String(reference ?? "").trim();
  const submissionNote = String(note ?? "").trim();
  if (submissionReference.length < 3 || submissionReference.length > 160) throw new Response("Enter the regulator submission reference or receipt number.", { status: 400 });
  if (submissionNote.length > 1_000) throw new Response("Submission notes must be 1,000 characters or fewer.", { status: 400 });
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.complianceReport.update({ where: { id }, data: { status: "submitted", submittedBy: actor.id, submittedAt: now, submissionReference, submissionNote: submissionNote || null }, include: reportInclude });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "COMPLIANCE_REPORT_SUBMISSION_RECORDED", entityType: "compliance_report", entityId: id, summary: `${id} submission recorded with reference ${submissionReference}`, previousValue: { status: row.status }, newValue: { status: "submitted", submissionReference, submittedAt: now } });
    return next;
  });
  return serializeComplianceReport(updated);
}

export async function listComplianceEscalations(actor: Actor) {
  const rows = await prisma.complianceEscalation.findMany({
    where: { brokerId: actor.brokerId },
    include: { creator: { select: { fullName: true } }, reviewer: { select: { fullName: true } } },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    subject: row.subject,
    summary: row.summary,
    linkedEntityType: row.linkedEntityType,
    linkedEntityId: row.linkedEntityId,
    awarenessAt: row.awarenessAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    overdue: !["reported", "closed"].includes(row.status) && row.dueAt.getTime() < now,
    decision: row.decision,
    submissionReference: row.submissionReference,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdBy: row.creator.fullName,
    reviewedBy: row.reviewer?.fullName ?? null,
  }));
}

export async function createComplianceEscalation(actor: Actor, input: Record<string, unknown>) {
  if (!isComplianceEscalationType(input.eventType)) throw new Response("Select a supported escalation type.", { status: 400 });
  const subject = String(input.subject ?? "").trim();
  const summary = String(input.summary ?? "").trim();
  if (subject.length < 5 || subject.length > 160) throw new Response("Enter a concise escalation subject.", { status: 400 });
  if (summary.length < 10 || summary.length > 4_000) throw new Response("Enter an evidence-based summary between 10 and 4,000 characters.", { status: 400 });
  const awarenessAt = input.awarenessAt ? new Date(String(input.awarenessAt)) : new Date();
  if (Number.isNaN(awarenessAt.getTime()) || awarenessAt.getTime() > Date.now() + 60_000) throw new Response("Awareness time is invalid.", { status: 400 });
  const id = `ESC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const dueAt = twentyFourHourDueAt(awarenessAt);
  await prisma.$transaction(async (tx) => {
    await tx.complianceEscalation.create({ data: {
      id,
      brokerId: actor.brokerId,
      eventType: input.eventType as string,
      subject,
      summary,
      linkedEntityType: String(input.linkedEntityType ?? "").trim() || null,
      linkedEntityId: String(input.linkedEntityId ?? "").trim() || null,
      awarenessAt,
      dueAt,
      createdBy: actor.id,
    } });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "COMPLIANCE_ESCALATION_OPENED", entityType: "compliance_escalation", entityId: id, summary: `${id} opened with a 24-hour review clock`, newValue: { eventType: input.eventType, awarenessAt, dueAt } });
  });
  return { id, status: "open", dueAt: dueAt.toISOString() };
}

export async function actOnComplianceEscalation(actor: Actor, id: string, input: Record<string, unknown>) {
  const row = await prisma.complianceEscalation.findFirst({ where: { id, brokerId: actor.brokerId } });
  if (!row) throw new Response("Escalation not found for this tenant.", { status: 404 });
  if (["reported", "closed"].includes(row.status)) throw new Response("This compliance escalation is already final.", { status: 409 });
  const action = String(input.action ?? "");
  const decision = String(input.decision ?? row.decision ?? "").trim();
  if (["review", "reported", "close"].includes(action) && (decision.length < 10 || decision.length > 4_000)) {
    throw new Response("Record the compliance decision and rationale.", { status: 400 });
  }
  if (action === "review") {
    await prisma.$transaction(async (tx) => {
      await tx.complianceEscalation.update({ where: { id }, data: { status: "under_review", decision, reviewedBy: actor.id, reviewedAt: new Date() } });
      await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "COMPLIANCE_ESCALATION_REVIEWED", entityType: "compliance_escalation", entityId: id, summary: `${id} compliance decision recorded`, newValue: { status: "under_review", decision } });
    });
    return { status: "under_review" };
  }
  if (action === "reported") {
    const submissionReference = String(input.submissionReference ?? "").trim();
    if (submissionReference.length < 3 || submissionReference.length > 160) throw new Response("Enter the regulator submission reference or receipt number.", { status: 400 });
    const submittedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.complianceEscalation.update({ where: { id }, data: { status: "reported", decision, submissionReference, submittedAt, reviewedBy: actor.id, reviewedAt: row.reviewedAt ?? submittedAt } });
      await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "COMPLIANCE_ESCALATION_REPORTED", entityType: "compliance_escalation", entityId: id, summary: `${id} reported with reference ${submissionReference}`, newValue: { status: "reported", decision, submissionReference, submittedAt } });
    });
    return { status: "reported" };
  }
  if (action === "close") {
    await prisma.$transaction(async (tx) => {
      await tx.complianceEscalation.update({ where: { id }, data: { status: "closed", decision, reviewedBy: actor.id, reviewedAt: row.reviewedAt ?? new Date() } });
      await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "COMPLIANCE_ESCALATION_CLOSED", entityType: "compliance_escalation", entityId: id, summary: `${id} closed after compliance review`, newValue: { status: "closed", decision } });
    });
    return { status: "closed" };
  }
  throw new Response("Unsupported escalation action.", { status: 400 });
}

export async function recordClientScreening(actor: Actor, clientId: string, input: Record<string, unknown>) {
  const client = await prisma.client.findFirst({ where: { id: clientId, brokerId: actor.brokerId } });
  if (!client) throw new Response("Client not found for this tenant.", { status: 404 });
  if (!isScreeningResult(input.result)) throw new Response("Select a valid screening result.", { status: 400 });
  const provider = String(input.provider ?? "").trim();
  const reference = String(input.reference ?? "").trim();
  const notes = String(input.notes ?? "").trim();
  if (provider.length < 2 || provider.length > 120) throw new Response("Record the screening provider or process used.", { status: 400 });
  if (reference.length > 160 || notes.length > 1_000) throw new Response("Screening evidence is too long.", { status: 400 });
  const screenedAt = input.screenedAt ? new Date(String(input.screenedAt)) : new Date();
  if (Number.isNaN(screenedAt.getTime()) || screenedAt.getTime() > Date.now() + 60_000) throw new Response("Screening time is invalid.", { status: 400 });
  const id = `SCR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  await prisma.$transaction(async (tx) => {
    await tx.clientScreening.create({ data: { id, brokerId: actor.brokerId, clientId, provider, result: input.result as string, reference: reference || null, notes: notes || null, screenedAt, recordedBy: actor.id } });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "CLIENT_SCREENING_RECORDED", entityType: "client_screening", entityId: id, summary: `${client.fullName} sanctions and PEP screening recorded as ${input.result}`, newValue: { clientId, provider, result: input.result, reference, screenedAt } });
  });
  return { id, result: input.result, screenedAt: screenedAt.toISOString() };
}

export async function buildClientStatementSnapshot(actor: Pick<Actor, "brokerId">, clientId: string, start: unknown, end: unknown) {
  const { periodStart, periodEnd } = reportPeriod(start, end);
  const profile = await brokerProfile(actor);
  const client = await prisma.client.findFirst({
    where: { id: clientId, brokerId: actor.brokerId },
    include: {
      accounts: {
        orderBy: { createdAt: "asc" },
        take: 1,
        include: {
          cashLedgerEntries: { where: { valueDate: { lte: periodEnd } }, orderBy: [{ valueDate: "asc" }, { createdAt: "asc" }] },
          securitiesLedgerEntries: { where: { valueDate: { lte: periodEnd } }, include: { instrument: true }, orderBy: [{ valueDate: "asc" }, { createdAt: "asc" }] },
          orders: { include: { instrument: true, trades: { where: { tradeDate: { gte: periodStart, lte: periodEnd } }, orderBy: { capturedAt: "asc" } } } },
        },
      },
    },
  });
  if (!client || !client.accounts[0]) throw new Response("Client account not found for this tenant.", { status: 404 });
  const account = client.accounts[0];
  const before = account.cashLedgerEntries.filter((entry) => entry.valueDate < periodStart);
  const within = account.cashLedgerEntries.filter((entry) => entry.valueDate >= periodStart && entry.valueDate <= periodEnd);
  const openingCash = before.at(-1)?.runningBalance ?? D(0);
  const closingCash = within.at(-1)?.runningBalance ?? openingCash;
  const latestHolding = new Map<string, (typeof account.securitiesLedgerEntries)[number]>();
  account.securitiesLedgerEntries.forEach((entry) => latestHolding.set(entry.instrumentId, entry));
  const snapshot: ClientStatementSnapshot = {
    kind: "client_statement",
    ...profile,
    client: { id: client.id, code: client.clientCode, name: client.fullName, accountNumber: account.accountNumber, currency: account.currency },
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    openingCash: toNum(openingCash),
    closingCash: toNum(closingCash),
    transactions: within.map((entry) => ({
      date: entry.valueDate.toISOString().slice(0, 10),
      type: entry.entryType,
      reference: entry.cashMovementId ?? entry.tradeId ?? entry.orderId ?? entry.id,
      debit: entry.totalImpact.lt(0) ? Math.abs(toNum(entry.totalImpact)) : 0,
      credit: entry.totalImpact.gt(0) ? toNum(entry.totalImpact) : 0,
      runningBalance: toNum(entry.runningBalance),
      description: entry.reason ?? entry.description,
    })),
    trades: account.orders.flatMap((order) => order.trades.map((trade) => ({
      tradeId: trade.id,
      orderId: order.id,
      tradeDate: trade.tradeDate.toISOString().slice(0, 10),
      symbol: order.instrument.symbol,
      side: order.side,
      quantity: toNum(trade.quantityFilled),
      price: toNum(trade.executionPrice),
      gross: toNum(trade.grossAmount),
      fees: toNum(trade.fees),
      net: toNum(trade.netAmount),
      settlementDate: trade.settlementDate.toISOString().slice(0, 10),
    }))),
    holdings: [...latestHolding.values()].filter((entry) => entry.runningQuantity.gt(0)).map((entry) => ({ symbol: entry.instrument.symbol, name: entry.instrument.name, quantity: toNum(entry.runningQuantity) })),
  };
  const validation: ReportValidation = { blocking: [], notices: [] };
  return { snapshot, validation, periodStart, periodEnd, clientName: client.fullName };
}

export async function buildClientStatement(actor: Actor, clientId: string, start: unknown, end: unknown) {
  const { snapshot, validation, periodStart, periodEnd, clientName } = await buildClientStatementSnapshot(actor, clientId, start, end);
  const id = `STM-${crypto.randomUUID().slice(0, 10).toUpperCase()}`;
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.complianceReport.create({ data: { id, brokerId: actor.brokerId, clientId, reportType: "client_statement", periodStart, periodEnd, status: "prepared", snapshot: snapshot as unknown as Prisma.InputJsonValue, validation: validation as unknown as Prisma.InputJsonValue, preparedBy: actor.id }, include: reportInclude });
    await writeAudit(tx, { brokerId: actor.brokerId, actorId: actor.id, action: "CLIENT_STATEMENT_GENERATED", entityType: "compliance_report", entityId: id, summary: `${clientName} account statement generated for ${snapshot.periodStart} to ${snapshot.periodEnd}`, newValue: { clientId, periodStart, periodEnd } });
    return created;
  });
  return row;
}

export function compliancePermissionForAction(action: string) {
  if (action === "review") return COMPLIANCE_PERMISSIONS.reportReview;
  if (action === "submit") return COMPLIANCE_PERMISSIONS.reportSubmit;
  return COMPLIANCE_PERMISSIONS.reportPrepare;
}
