"use client";

import { useEffect, useMemo, useState } from "react";
import type { BrokerClient, DemoOrder } from "../../../lib/demo-data";
import { buildReports, downloadCsv, feesEarned, type Report } from "../../../lib/broker-reports";
import { COMPLIANCE_ESCALATION_LABELS, COMPLIANCE_REPORT_LABELS, type ComplianceEscalationType, type ComplianceReportType } from "../../../lib/compliance";
import { COMPLIANCE_PERMISSIONS, hasPermission, type Role } from "../../../lib/frank";
import { BrandSelect } from "../../shared/brand-select";
import { BROKER_TENANT_ID, EmptyState, Metric, SectionHeader, auditTime, displayLabel, etb, type AuditEntry } from "../shared/broker-foundation";

type ComplianceReportView = {
  id: string;
  reportType: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  blockingIssues: number;
  notices: number;
  validation: { blocking: string[]; notices: string[] };
  preparedBy: string;
  reviewedBy: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  submissionReference: string | null;
  createdAt: string;
};

type ComplianceEscalationView = {
  id: string;
  eventType: string;
  subject: string;
  summary: string;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  awarenessAt: string;
  dueAt: string;
  status: string;
  overdue: boolean;
  decision: string | null;
  submissionReference: string | null;
  submittedAt: string | null;
  createdBy: string;
  reviewedBy: string | null;
};

function defaultPeriod(type: ComplianceReportType) {
  const today = new Date();
  if (type === "monthly_transactions") {
    return {
      from: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10),
      to: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).toISOString().slice(0, 10),
    };
  }
  const month = Math.floor(today.getUTCMonth() / 3) * 3;
  return {
    from: new Date(Date.UTC(today.getUTCFullYear(), month, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(today.getUTCFullYear(), month + 3, 0)).toISOString().slice(0, 10),
  };
}

export function ReportsPage({ orders, clients, audit, role, onDownloaded, onNotify }: { orders: DemoOrder[]; clients: BrokerClient[]; audit: AuditEntry[]; role: Role; onDownloaded: (name: string) => void; onNotify: (message: string, tone?: "success" | "error") => void }) {
  const reports = useMemo(() => buildReports(orders, clients, audit), [orders, clients, audit]);
  const totalFees = useMemo(() => feesEarned(orders), [orders]);
  const download = (report: Report) => { downloadCsv(report); onDownloaded(report.name); };
  const canViewCompliance = hasPermission(role, COMPLIANCE_PERMISSIONS.view);
  const [tab, setTab] = useState<"regulatory" | "escalations" | "operational">(canViewCompliance ? "regulatory" : "operational");
  const [reportType, setReportType] = useState<ComplianceReportType>("monthly_transactions");
  const initialPeriod = defaultPeriod("monthly_transactions");
  const [periodFrom, setPeriodFrom] = useState(initialPeriod.from);
  const [periodTo, setPeriodTo] = useState(initialPeriod.to);
  const [complianceReports, setComplianceReports] = useState<ComplianceReportView[]>([]);
  const [escalations, setEscalations] = useState<ComplianceEscalationView[]>([]);
  const [loading, setLoading] = useState(canViewCompliance);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [submissionTarget, setSubmissionTarget] = useState<ComplianceReportView | null>(null);
  const [submissionReference, setSubmissionReference] = useState("");
  const [submissionNote, setSubmissionNote] = useState("");
  const [newEscalationOpen, setNewEscalationOpen] = useState(false);
  const [escalationType, setEscalationType] = useState<ComplianceEscalationType>("regulatory_breach");
  const [escalationSubject, setEscalationSubject] = useState("");
  const [escalationSummary, setEscalationSummary] = useState("");
  const [escalationEntityType, setEscalationEntityType] = useState("");
  const [escalationEntityId, setEscalationEntityId] = useState("");
  const [reviewTarget, setReviewTarget] = useState<ComplianceEscalationView | null>(null);
  const [decision, setDecision] = useState("");
  const [escalationReference, setEscalationReference] = useState("");
  const activeTab = canViewCompliance ? tab : "operational";

  const headers = { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role };
  useEffect(() => {
    if (!canViewCompliance) return;
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/compliance/reports", { headers, signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject()),
      fetch("/api/compliance/escalations", { headers, signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject()),
    ]).then(([reportResult, escalationResult]: [{ reports: ComplianceReportView[] }, { escalations: ComplianceEscalationView[] }]) => {
      setComplianceReports(reportResult.reports);
      setEscalations(escalationResult.escalations);
    }).catch(() => {
      if (!controller.signal.aborted) {
        setComplianceReports([]);
        setEscalations([]);
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewCompliance, refreshKey, role]);

  const jsonAction = async (url: string, body: Record<string, unknown>, success: string) => {
    setBusy(url);
    try {
      const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "The action could not be completed.");
      onNotify(success);
      setRefreshKey((key) => key + 1);
      return true;
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "The action could not be completed.", "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const prepare = () => void jsonAction("/api/compliance/reports", { reportType, periodStart: periodFrom, periodEnd: periodTo }, "Report snapshot prepared from the current broker book.");
  const reviewReport = (id: string) => void jsonAction(`/api/compliance/reports/${encodeURIComponent(id)}/action`, { action: "review" }, "Report reviewed and approved for broker submission.");
  const recordSubmission = async () => {
    if (!submissionTarget) return;
    const done = await jsonAction(`/api/compliance/reports/${encodeURIComponent(submissionTarget.id)}/action`, { action: "submit", submissionReference, note: submissionNote }, "Regulator submission evidence recorded.");
    if (done) setSubmissionTarget(null);
  };
  const downloadComplianceReport = async (report: ComplianceReportView) => {
    setBusy(report.id);
    try {
      const response = await fetch(`/api/compliance/reports/${encodeURIComponent(report.id)}/download`, { headers });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error || "The workbook could not be generated.");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${report.id}.xlsx`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
      onDownloaded(report.name);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "The workbook could not be generated.", "error");
    } finally {
      setBusy(null);
    }
  };
  const createEscalation = async () => {
    const done = await jsonAction("/api/compliance/escalations", { eventType: escalationType, subject: escalationSubject, summary: escalationSummary, linkedEntityType: escalationEntityType, linkedEntityId: escalationEntityId }, "Compliance escalation opened with a 24-hour review clock.");
    if (done) {
      setNewEscalationOpen(false);
      setEscalationSubject(""); setEscalationSummary(""); setEscalationEntityType(""); setEscalationEntityId("");
    }
  };
  const actOnEscalation = async (action: "review" | "reported" | "close") => {
    if (!reviewTarget) return;
    const done = await jsonAction(`/api/compliance/escalations/${encodeURIComponent(reviewTarget.id)}/action`, { action, decision, submissionReference: escalationReference }, action === "review" ? "Compliance decision recorded." : action === "reported" ? "Regulatory report evidence recorded." : "Escalation closed after review.");
    if (done) setReviewTarget(null);
  };

  const openEscalations = escalations.filter((item) => !["reported", "closed"].includes(item.status));
  const overdueEscalations = openEscalations.filter((item) => item.overdue);
  return <>
    <SectionHeader eyebrow="BROKER CONTROL REPORTING" title="Reports" copy="Prepare prescribed ECMA returns, manage 24-hour compliance escalations, and export operational records from Frank." />
    <nav className="report-tabs" role="tablist" aria-label="Report areas">
      {canViewCompliance && <button className={activeTab === "regulatory" ? "active" : ""} onClick={() => setTab("regulatory")}>Regulatory returns</button>}
      {canViewCompliance && <button className={activeTab === "escalations" ? "active" : ""} onClick={() => setTab("escalations")}>24-hour escalations{openEscalations.length > 0 && <b>{openEscalations.length}</b>}</button>}
      <button className={activeTab === "operational" ? "active" : ""} onClick={() => setTab("operational")}>Operational exports</button>
    </nav>

    {activeTab === "regulatory" && canViewCompliance && <>
      <section className="panel report-preparer"><div><span className="eyebrow">PREPARE PRESCRIBED RETURN</span><h2>Generate from the broker book</h2><p>Frank validates owned brokerage data, stores the point-in-time snapshot, and creates the ECMA workbook. The broker reviews and submits it.</p></div><div className="report-preparer-form"><label>Return<BrandSelect value={reportType} onChange={(next) => { const type = next as ComplianceReportType; const period = defaultPeriod(type); setReportType(type); setPeriodFrom(period.from); setPeriodTo(period.to); }} ariaLabel="Regulatory return" options={Object.entries(COMPLIANCE_REPORT_LABELS).map(([value, label]) => ({ value, label }))} /></label><label>From<input type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} /></label><label>To<input type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} /></label>{hasPermission(role, COMPLIANCE_PERMISSIONS.reportPrepare) && <button className="btn primary" disabled={Boolean(busy) || !periodFrom || !periodTo || periodTo < periodFrom} onClick={prepare}>{busy === "/api/compliance/reports" ? "Preparing…" : "Prepare report"}</button>}</div></section>
      <section className="panel compliance-report-list"><div className="panel-head"><div><span className="eyebrow">CONTROLLED REPORT RECORD</span><h2>Prepared and submitted returns</h2></div></div>{loading ? <div className="crm-loading">Loading reports…</div> : complianceReports.filter((item) => item.reportType !== "client_statement").length ? complianceReports.filter((item) => item.reportType !== "client_statement").map((report) => <article key={report.id}><div className="compliance-report-main"><span className={`status ${report.status === "submitted" ? "status-success" : report.status === "needs_attention" ? "status-danger" : "status-warning"}`}><i />{displayLabel(report.status)}</span><h3>{report.name}</h3><p>{report.periodStart} to {report.periodEnd}</p><small>{report.id} · Prepared by {report.preparedBy}</small>{report.validation.blocking.length > 0 && <details><summary>{report.validation.blocking.length} validation {report.validation.blocking.length === 1 ? "issue" : "issues"}</summary>{report.validation.blocking.map((issue) => <p key={issue}>{issue}</p>)}</details>}</div><div className="compliance-report-evidence"><span><small>Review</small><b>{report.reviewedBy ?? "Pending"}</b></span><span><small>Submission</small><b>{report.submissionReference ?? "Not recorded"}</b></span></div><div className="compliance-report-actions"><button className="btn secondary small" disabled={Boolean(busy) || report.blockingIssues > 0} onClick={() => void downloadComplianceReport(report)}>{busy === report.id ? "Generating…" : "Download XLSX"}</button>{report.status === "prepared" && hasPermission(role, COMPLIANCE_PERMISSIONS.reportReview) && <button className="btn primary small" disabled={Boolean(busy)} onClick={() => reviewReport(report.id)}>Review</button>}{report.status === "reviewed" && hasPermission(role, COMPLIANCE_PERMISSIONS.reportSubmit) && <button className="btn primary small" onClick={() => { setSubmissionTarget(report); setSubmissionReference(""); setSubmissionNote(""); }}>Record submission</button>}</div></article>) : <EmptyState title="No regulatory returns prepared" copy="Choose a report and period above. Frank will preserve each generated snapshot and its approval trail." />}</section>
    </>}

    {activeTab === "escalations" && canViewCompliance && <>
      <section className="metric-grid crm-metrics"><Metric label="Open" value={String(openEscalations.length)} note="Awaiting a compliance outcome" tone={openEscalations.length ? "warning" : "success"} /><Metric label="Overdue" value={String(overdueEscalations.length)} note="Past the 24-hour clock" tone={overdueEscalations.length ? "danger" : "success"} /><Metric label="Reported" value={String(escalations.filter((item) => item.status === "reported").length)} note="Submission evidence recorded" tone="brand" /><Metric label="Decision owner" value="Broker" note="Frank does not make the legal decision" tone="purple" /></section>
      <section className="panel escalation-list"><div className="panel-head"><div><span className="eyebrow">24-HOUR REVIEW</span><h2>Compliance escalations</h2></div>{hasPermission(role, COMPLIANCE_PERMISSIONS.escalationCreate) && <button className="btn primary" onClick={() => setNewEscalationOpen(true)}>＋ New escalation</button>}</div>{loading ? <div className="crm-loading">Loading escalations…</div> : escalations.length ? escalations.map((item) => <article key={item.id} className={item.overdue ? "overdue" : ""}><span className={`queue-icon ${item.overdue ? "danger" : item.status === "reported" || item.status === "closed" ? "success" : "warning"}`}>{item.overdue ? "!" : "◇"}</span><div><span className="eyebrow">{displayLabel(item.eventType)} · {item.id}</span><h3>{item.subject}</h3><p>{item.summary}</p><small>Awareness {new Date(item.awarenessAt).toLocaleString("en-GB")} · Due {new Date(item.dueAt).toLocaleString("en-GB")}</small>{item.decision && <em>Decision: {item.decision}</em>}</div><strong>{displayLabel(item.status)}<small>{item.submissionReference ?? item.createdBy}</small></strong>{hasPermission(role, COMPLIANCE_PERMISSIONS.escalationManage) && !["reported", "closed"].includes(item.status) && <button className="btn secondary small" onClick={() => { setReviewTarget(item); setDecision(item.decision ?? ""); setEscalationReference(""); }}>Review</button>}</article>) : <EmptyState title="No compliance escalations" copy="Broker staff can raise a suspected conduct, threshold, breach, or material event for compliance review." />}</section>
    </>}

    {activeTab === "operational" && <><div className="report-grid">{reports.map((report, index) => <button className="panel report-card" key={report.id} onClick={() => download(report)} disabled={report.rows.length === 0}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{report.name}</h3><p>{report.description}</p></div><em>{report.rows.length} {report.rows.length === 1 ? "row" : "rows"} · CSV <b>↓</b></em></button>)}</div><section className="panel fee-summary"><div><span className="eyebrow">EXECUTED THIS PERIOD</span><h2>Brokerage fees earned</h2><p>Sum of fees on executed orders in the current book.</p></div><strong>{etb(totalFees)}<small>{reports.find((report) => report.id === "fees")?.rows.length ?? 0} executed orders</small></strong></section></>}

    {submissionTarget && <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setSubmissionTarget(null); }}><aside className="drawer" role="dialog" aria-modal="true" aria-label="Record report submission"><div className="drawer-content"><div className="drawer-title"><span className="eyebrow">BROKER SUBMISSION EVIDENCE</span><h2>Record ECMA submission</h2><p>Frank records the receipt. It does not submit to ECMA or certify the filing.</p></div><div className="form-section"><label>Submission reference<input value={submissionReference} onChange={(event) => setSubmissionReference(event.target.value)} maxLength={160} placeholder="Receipt or filing reference" /></label><label>Note<textarea rows={4} value={submissionNote} onChange={(event) => setSubmissionNote(event.target.value)} maxLength={1000} placeholder="Optional submission context" /></label></div><div className="drawer-actions"><button className="btn secondary" onClick={() => setSubmissionTarget(null)}>Cancel</button><button className="btn primary" disabled={Boolean(busy) || submissionReference.trim().length < 3} onClick={() => void recordSubmission()}>{busy ? "Saving…" : "Record submission"}</button></div></div></aside></div>}
    {newEscalationOpen && <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setNewEscalationOpen(false); }}><aside className="drawer" role="dialog" aria-modal="true" aria-label="New compliance escalation"><div className="drawer-content"><div className="drawer-title"><span className="eyebrow">BROKER COMPLIANCE REVIEW</span><h2>Open a 24-hour escalation</h2><p>Record when the broker became aware and link the relevant Frank record when available.</p></div><div className="form-section"><label>Event type<BrandSelect value={escalationType} onChange={(next) => setEscalationType(next as ComplianceEscalationType)} ariaLabel="Escalation event type" options={Object.entries(COMPLIANCE_ESCALATION_LABELS).map(([value, label]) => ({ value, label }))} /></label><label>Subject<input value={escalationSubject} onChange={(event) => setEscalationSubject(event.target.value)} maxLength={160} placeholder="Concise issue summary" /></label><label>Evidence summary<textarea rows={5} value={escalationSummary} onChange={(event) => setEscalationSummary(event.target.value)} maxLength={4000} placeholder="Known facts only. Compliance records the decision separately." /></label><div className="form-row"><label>Linked record type<input value={escalationEntityType} onChange={(event) => setEscalationEntityType(event.target.value)} maxLength={80} placeholder="Order, trade or client" /></label><label>Linked record ID<input value={escalationEntityId} onChange={(event) => setEscalationEntityId(event.target.value)} maxLength={160} placeholder="Record ID" /></label></div></div><div className="drawer-actions"><button className="btn secondary" onClick={() => setNewEscalationOpen(false)}>Cancel</button><button className="btn primary" disabled={Boolean(busy) || escalationSubject.trim().length < 5 || escalationSummary.trim().length < 10} onClick={() => void createEscalation()}>{busy ? "Opening…" : "Open escalation"}</button></div></div></aside></div>}
    {reviewTarget && <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewTarget(null); }}><aside className="drawer" role="dialog" aria-modal="true" aria-label="Review compliance escalation"><div className="drawer-content"><div className="drawer-title"><span className="eyebrow">{reviewTarget.id}</span><h2>{reviewTarget.subject}</h2><p>Record the broker compliance officer&apos;s decision. Reporting and closure remain explicit actions.</p></div><div className="form-section"><label>Decision and rationale<textarea rows={6} value={decision} onChange={(event) => setDecision(event.target.value)} maxLength={4000} placeholder="Assessment, decision and supporting rationale" /></label><label>Submission reference<input value={escalationReference} onChange={(event) => setEscalationReference(event.target.value)} maxLength={160} placeholder="Required only when recording a report" /></label></div><div className="drawer-actions escalation-actions"><button className="btn secondary" onClick={() => setReviewTarget(null)}>Cancel</button><button className="btn secondary" disabled={Boolean(busy) || decision.trim().length < 10} onClick={() => void actOnEscalation("close")}>Close, no filing</button><button className="btn secondary" disabled={Boolean(busy) || decision.trim().length < 10} onClick={() => void actOnEscalation("review")}>Save decision</button><button className="btn primary" disabled={Boolean(busy) || decision.trim().length < 10 || escalationReference.trim().length < 3} onClick={() => void actOnEscalation("reported")}>Record report</button></div></div></aside></div>}
  </>;
}

export function AuditPage({ events }: { events: AuditEntry[] }) {
  const exportAudit = () => {
    const rows = [["Time", "Actor", "Action", "Entity", "Detail"], ...events.map((item) => [item.time, item.actor, item.action, item.entity, item.detail])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "frankbroker-audit-log.csv"; link.click(); URL.revokeObjectURL(url);
  };
  return <><SectionHeader eyebrow="CONTROL RECORD" title="Audit trail" copy="Sensitive actions, actors, timestamps, and recorded state for every workflow." action={<button className="btn secondary" onClick={exportAudit}>Export audit log</button>} /><section className="panel audit-timeline">{events.map((item) => { const date = new Date(item.time); return <div key={item.id ?? `${item.time}-${item.action}`}><span className="audit-dot" /><time>{Number.isNaN(date.getTime()) ? "Demo record" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}<br /><b>{auditTime(item.time)}</b></time><div><span className="asset-chip">{displayLabel(item.entity)}</span><h3>{displayLabel(item.action)}</h3><p>{item.detail}</p></div><strong>{item.actor}<small>Addis Ababa · Workspace</small></strong></div>; })}</section></>;
}
