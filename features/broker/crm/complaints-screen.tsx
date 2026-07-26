"use client";

import { useEffect, useState } from "react";
import { CRM_PERMISSIONS, hasPermission, type Role } from "../../../lib/frank";
import { CASE_STATUS_LABELS, availableCaseStatuses, severityTone, type CaseStatus } from "../../../lib/crm/cases";
import {
  BROKER_TENANT_ID,
  EmptyState,
  Metric,
  SectionHeader,
  auditTime,
  displayLabel,
  fallbackCrmCases,
  type CrmCaseView,
  type CrmCasesResponse,
} from "../shared/broker-foundation";

/** A complaint is visually distinct from an ordinary enquiry: severity, target date, overdue flag. */
export function ServiceCasePanel({ serviceCase, role, busy, onStatus, onFindings, onOpenThread }: {
  serviceCase: CrmCaseView;
  role: Role;
  busy: boolean;
  onStatus: (item: CrmCaseView, next: string) => void;
  onFindings: (item: CrmCaseView, findings: string) => void;
  onOpenThread?: (threadId: string) => void;
}) {
  const [findings, setFindings] = useState(serviceCase.internalFindings ?? "");
  const canManage = hasPermission(role, CRM_PERMISSIONS.caseManage);

  return <section className={`panel crm-case${serviceCase.overdue ? " overdue" : ""}`}>
    <div className="panel-head">
      <div>
        <span className="eyebrow">{serviceCase.id} · {displayLabel(serviceCase.category)}</span>
        <h2>{serviceCase.subject}</h2>
      </div>
      <div className="crm-badges">
        <span className={`status status-${severityTone(serviceCase.severity)}`}><i />{serviceCase.severity}</span>
        <span className={`status status-${serviceCase.status === "resolved" || serviceCase.status === "closed" ? "success" : serviceCase.overdue ? "danger" : "warning"}`}><i />{serviceCase.statusLabel}</span>
        {serviceCase.overdue && <span className="status status-danger"><i />Overdue</span>}
      </div>
    </div>
    <div className="panel-body">
      <dl className="detail-grid">
        <div><dt>Investor</dt><dd>{serviceCase.client?.name ?? "-"}</dd></div>
        <div><dt>Owner</dt><dd>{serviceCase.assignedToName ?? "Unassigned"}</dd></div>
        <div><dt>Opened</dt><dd>{auditTime(serviceCase.openedAt)}</dd></div>
        <div><dt>Target resolution</dt><dd>{serviceCase.targetResolutionAt ? serviceCase.targetResolutionAt.slice(0, 10) : "-"}</dd></div>
      </dl>

      {serviceCase.threadId && (
        <div className="crm-related">
          <span><small>ORIGINAL CONVERSATION</small><b>{serviceCase.threadSubject ?? serviceCase.threadId}</b></span>
          {onOpenThread && <button className="btn secondary small" onClick={() => onOpenThread(serviceCase.threadId!)}>Open conversation</button>}
        </div>
      )}

      {serviceCase.resolutionSummary && (
        <div className="crm-resolution"><small>RESOLUTION</small><p>{serviceCase.resolutionSummary}</p></div>
      )}

      {canManage ? (
        <div className="crm-case-controls">
          <label>Internal findings
            <textarea rows={3} value={findings} onChange={(event) => setFindings(event.target.value)} maxLength={4000} placeholder="Working notes for the team - never shown to the investor." />
          </label>
          <div className="crm-case-actions">
            <button className="btn secondary small" disabled={busy} onClick={() => onFindings(serviceCase, findings)}>Save findings</button>
            <div className="brand-select">
              <select value="" disabled={busy || !availableCaseStatuses(serviceCase.status).length} onChange={(event) => { if (event.target.value) onStatus(serviceCase, event.target.value); }} aria-label={`Update ${serviceCase.id}`}>
                <option value="">Move to…</option>
                {availableCaseStatuses(serviceCase.status).map((status) => <option key={status} value={status}>{CASE_STATUS_LABELS[status as CaseStatus]}</option>)}
              </select><i>⌄</i>
            </div>
          </div>
        </div>
      ) : (
        <div className="settings-note">Your role can view complaints but not manage them.</div>
      )}
    </div>
  </section>;
}

export function ComplaintsPage({ role, onNotify, onOpenThread }: { role: Role; onNotify: (message: string, tone?: "success" | "error") => void; onOpenThread?: (threadId: string) => void }) {
  const [cases, setCases] = useState<CrmCaseView[]>([]);
  const [facets, setFacets] = useState({ open: 0, overdue: 0 });
  const [status, setStatus] = useState("open_all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [resolving, setResolving] = useState<CrmCaseView | null>(null);
  const [summary, setSummary] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/crm/cases?status=${encodeURIComponent(status)}`, { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } });
        if (!response.ok) throw new Error("Cases unavailable");
        const data = (await response.json()) as CrmCasesResponse;
        setCases(data.cases);
        setFacets(data.facets);
      } catch {
        const rows = status === "open_all" ? fallbackCrmCases.filter((item) => !["resolved", "closed"].includes(item.status)) : fallbackCrmCases;
        setCases(rows);
        setFacets({ open: rows.length, overdue: rows.filter((item) => item.overdue).length });
      } finally {
        setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [role, status, refreshKey]);

  const act = async (caseId: string, body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/crm/cases/${encodeURIComponent(caseId)}/action`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "The case could not be updated.");
      setRefreshKey((key) => key + 1);
      onNotify(message);
      return true;
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "The case could not be updated.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (item: CrmCaseView, next: string) => {
    // Resolving requires a written outcome, so it opens a short form.
    if (next === "resolved") { setResolving(item); setSummary(""); return; }
    void act(item.id, { action: "status", status: next }, `Case moved to ${CASE_STATUS_LABELS[next as CaseStatus] ?? next}.`);
  };

  const confirmResolve = async () => {
    if (!resolving) return;
    const done = await act(resolving.id, { action: "status", status: "resolved", resolutionSummary: summary }, "Case resolved and the investor was notified.");
    if (done) setResolving(null);
  };

  return <>
    <SectionHeader eyebrow="COMPLAINTS &amp; SERVICE CASES" title="Complaints" copy="Formal cases raised from investor conversations, with an owner, a target date, and a written outcome." />
    <section className="metric-grid crm-metrics">
      <Metric label="Open cases" value={String(facets.open)} note="Not yet resolved" tone={facets.open ? "warning" : "success"} />
      <Metric label="Overdue" value={String(facets.overdue)} note="Past target resolution" tone={facets.overdue ? "danger" : "success"} />
      <Metric label="In view" value={String(cases.length)} note="Matching this filter" tone="brand" />
      <Metric label="Escalation route" value="Compliance" note="Cases are visible to compliance" tone="purple" />
    </section>

    <div className="filter-row">
      <button className={`filter${status === "open_all" ? " active" : ""}`} onClick={() => setStatus("open_all")}>Open</button>
      <button className={`filter${status === "" ? " active" : ""}`} onClick={() => setStatus("")}>All</button>
      {(["under_review", "awaiting_investor", "resolved"] as const).map((value) => (
        <button key={value} className={`filter${status === value ? " active" : ""}`} onClick={() => setStatus(value)}>{CASE_STATUS_LABELS[value]}</button>
      ))}
    </div>

    {loading ? <div className="crm-loading" role="status">Loading cases…</div>
      : cases.length === 0 ? <section className="panel"><EmptyState title="No complaints open" copy="Complaints are raised from a conversation. Open one from the Conversations inbox when an investor escalates." /></section>
      : cases.map((item) => (
        <ServiceCasePanel key={item.id} serviceCase={item} role={role} busy={busy} onStatus={changeStatus} onFindings={(target, findings) => void act(target.id, { action: "findings", findings }, "Internal findings saved.")} onOpenThread={onOpenThread} />
      ))}

    {resolving && (
      <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setResolving(null); }}>
        <aside className="drawer" role="dialog" aria-modal="true" aria-label="Resolve case">
          <div className="drawer-content">
            <div className="drawer-title"><span className="eyebrow">RESOLVE CASE</span><h2>{resolving.subject}</h2><p>Write the outcome. The investor is notified that their complaint was resolved.</p></div>
            <div className="form-section">
              <label>Resolution summary<textarea rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={4000} placeholder="What was found, what was done, and what the investor was told." /></label>
            </div>
            <div className="drawer-actions">
              <button className="btn secondary" onClick={() => setResolving(null)}>Cancel</button>
              <button className="btn primary" disabled={busy || summary.trim().length < 10} onClick={() => void confirmResolve()}>{busy ? "Saving…" : "Resolve case"}</button>
            </div>
          </div>
        </aside>
      </div>
    )}
  </>;
}
