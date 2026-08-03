"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ADVISORY_PERMISSIONS, hasPermission, type Role } from "../../../lib/frank";
import { displayLabel, EmptyState, Metric, SectionHeader } from "../shared/broker-foundation";
import { BrandSelect } from "../../shared/brand-select";

type Portfolio = {
  metrics: { activeDeals: number; pendingApprovals: number; openQueries: number; overdueTasks: number };
  deals: Array<{ id: string; name: string; issuer: { id: string; name: string }; transactionType: string; marketSegment: string; stage: string; status: string; targetDate: string | null; readiness: { percent: number; complete: number; total: number }; blockedItems: number; nextDeadline: string | null }>;
  issuers: Array<{ id: string; legalName: string; tradingName: string | null; entityType: string; registrationNumber: string | null; sector: string | null; contactName: string | null; contactEmail: string | null; status: string }>;
};

type DealDetail = {
  id: string; name: string; transactionType: string; marketSegment: string; stage: string; status: string; targetDate: string | null;
  issuer: { legalName: string; tradingName: string | null; sector: string | null; registrationNumber: string | null };
  readiness: { percent: number; complete: number; total: number };
  checklistTemplate: { code: string; version: string; title: string };
  checklistItems: Array<{ id: string; section: string; title: string; guidance: string; expectedEvidence: string; required: boolean; custom: boolean; status: string; notes: string | null; dueDate: string | null; ownerUserId: string | null; version: number; sourceTitle: string | null; sourceUrl: string | null; sourceReference: string | null; preparedByUserId: string | null; reviewedByUserId: string | null; reviewNote: string | null; documents: Array<{ id: string; title: string }> }>;
  documents: Array<{ id: string; title: string; documentType: string; status: string; externalUrl: string | null; currentVersion: { id: string; versionNo: number; originalName: string } | null; versions: Array<{ id: string; versionNo: number; originalName: string; sizeBytes: number; uploadedAt: string }> }>;
  tasks: Array<{ id: string; title: string; description: string | null; status: string; priority: string; dueDate: string | null; assignedToUserId: string | null }>;
  parties: Array<{ id: string; partyRole: string; organization: string; contactName: string | null; email: string | null }>;
  submissions: Array<{ id: string; authority: string; submissionType: string; reference: string | null; status: string; responseDueAt: string | null; regulatoryQueries: Array<{ id: string; reference: string | null; question: string; status: string; dueDate: string | null }> }>;
  activity: Array<{ id: string; action: string; summary: string; actor: string; at: string }>;
};

const TABS = ["overview", "checklist", "documents", "tasks", "parties", "submissions", "activity"] as const;
type Tab = typeof TABS[number];

const statusTone = (status: string) => status === "satisfied" || status === "approved_admitted" ? "success" : status === "blocked" || status === "returned" ? "danger" : status === "pending_approval" ? "warning" : "brand";
const apiHeaders = (tenantId: string, role: Role, json = false) => ({ "x-frank-tenant-id": tenantId, "x-frank-demo-role": role, ...(json ? { "content-type": "application/json" } : {}) });

export function AdvisoryWorkspace({ role, tenantId, mode, onNotify }: { role: Role; tenantId: string; mode: "pipeline" | "issuers"; onNotify: (message: string, tone?: "success" | "error") => void }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  const [drawer, setDrawer] = useState<"issuer" | "deal" | "task" | "party" | "submission" | "query" | "document" | null>(null);
  const [refresh, setRefresh] = useState(0);

  const loadPortfolio = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/advisory", { signal, headers: apiHeaders(tenantId, role) });
      const data = await response.json() as Portfolio & { error?: string };
      if (!response.ok) throw new Error(data.error || "Advisory workspace unavailable.");
      setPortfolio(data);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setPortfolio(null);
    } finally { setLoading(false); }
  }, [role, tenantId]);

  const loadDeal = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/advisory/deals/${encodeURIComponent(id)}`, { headers: apiHeaders(tenantId, role) });
      const data = await response.json() as { deal?: DealDetail; error?: string };
      if (!response.ok || !data.deal) throw new Error(data.error || "Deal unavailable.");
      setDeal(data.deal);
    } catch (error) { onNotify(error instanceof Error ? error.message : "Deal unavailable.", "error"); }
  }, [onNotify, role, tenantId]);

  useEffect(() => { const controller = new AbortController(); setDeal(null); setDrawer(null); void loadPortfolio(controller.signal); return () => controller.abort(); }, [loadPortfolio, refresh]);
  useEffect(() => { if (deal) void loadDeal(deal.id); }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (portfolio?.deals ?? []).filter((item) => `${item.name} ${item.issuer.name}`.toLowerCase().includes(query.toLowerCase()) && (!stage || item.stage === stage)), [portfolio, query, stage]);
  const canManage = hasPermission(role, ADVISORY_PERMISSIONS.dealManage);

  if (deal) return <DealWorkspace deal={deal} tab={tab} setTab={setTab} role={role} tenantId={tenantId} onBack={() => setDeal(null)} onRefresh={() => setRefresh((value) => value + 1)} onNotify={onNotify} onOpenDrawer={setDrawer} drawer={drawer} />;
  return <>
    <SectionHeader eyebrow={mode === "issuers" ? "ISSUER DIRECTORY" : "ISSUER ADVISORY"} title={mode === "issuers" ? "Issuers" : "Advisory pipeline"} copy={mode === "issuers" ? "Organizations under readiness or admission engagements." : "Manage IPO and OTC-admission work without replacing the licensed professionals who produce it."} action={canManage ? <button className="btn primary" onClick={() => setDrawer(mode === "issuers" ? "issuer" : "deal")}>＋ {mode === "issuers" ? "Add issuer" : "New deal"}</button> : undefined} />
    {mode === "pipeline" && <div className="metric-grid advisory-metrics"><Metric label="Active deals" value={String(portfolio?.metrics.activeDeals ?? 0)} note="Across enabled checklist packs" /><Metric label="Pending sign-off" value={String(portfolio?.metrics.pendingApprovals ?? 0)} note="Maker-checker decisions" tone="warning" /><Metric label="Open queries" value={String(portfolio?.metrics.openQueries ?? 0)} note="ECMA, ESX and CSD" tone="info" /><Metric label="Overdue tasks" value={String(portfolio?.metrics.overdueTasks ?? 0)} note="Needs ownership" tone="danger" /></div>}
    {mode === "pipeline" ? <section className="panel table-panel advisory-panel"><div className="advisory-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issuer or deal…" /><BrandSelect value={stage} onChange={setStage} placeholder="All stages" ariaLabel="Deal stage" options={["draft", "readiness", "due_diligence", "filing_preparation", "submitted", "regulatory_review", "approved_admitted"].map((value) => ({ value, label: displayLabel(value) }))} /></div>{loading ? <div className="loading-state">Loading advisory pipeline…</div> : rows.length === 0 ? <EmptyState title="No deals found" copy="Create a deal from an enabled Ethiopian checklist pack." /> : <div className="table-scroll"><table className="advisory-table"><thead><tr><th>Deal</th><th>Stage</th><th>Readiness</th><th>Next deadline</th><th>Attention</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id} onClick={() => void loadDeal(item.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") void loadDeal(item.id); }}><td><b>{item.name}</b><small>{item.issuer.name} · {displayLabel(item.transactionType)} · {item.marketSegment.toUpperCase()}</small></td><td><span className={`status status-${statusTone(item.stage)}`}><i />{displayLabel(item.stage)}</span></td><td><div className="readiness"><span><i style={{ width: `${item.readiness.percent}%` }} /></span><b>{item.readiness.percent}%</b></div><small>{item.readiness.complete}/{item.readiness.total} mandatory</small></td><td>{item.nextDeadline ?? item.targetDate ?? "Not set"}</td><td>{item.blockedItems ? <span className="status status-danger"><i />{item.blockedItems} blocked</span> : <span className="muted">On track</span>}</td></tr>)}</tbody></table></div>}</section> : <IssuerDirectory issuers={portfolio?.issuers ?? []} loading={loading} />}
    {drawer && <AdvisoryDrawer kind={drawer} deal={null} portfolio={portfolio} tenantId={tenantId} role={role} onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); setRefresh((value) => value + 1); }} onNotify={onNotify} />}
  </>;
}

function IssuerDirectory({ issuers, loading }: { issuers: Portfolio["issuers"]; loading: boolean }) {
  if (loading) return <div className="loading-state">Loading issuers…</div>;
  return <section className="panel table-panel advisory-panel">{issuers.length === 0 ? <EmptyState title="No issuers yet" copy="Add the first organization under an advisory engagement." /> : <div className="table-scroll"><table className="advisory-table"><thead><tr><th>Issuer</th><th>Type</th><th>Sector</th><th>Registration</th><th>Primary contact</th><th>Status</th></tr></thead><tbody>{issuers.map((item) => <tr key={item.id}><td><b>{item.tradingName ?? item.legalName}</b><small>{item.legalName}</small></td><td>{displayLabel(item.entityType)}</td><td>{item.sector ?? "—"}</td><td>{item.registrationNumber ?? "—"}</td><td><b>{item.contactName ?? "Unassigned"}</b><small>{item.contactEmail}</small></td><td><span className="status status-success"><i />{displayLabel(item.status)}</span></td></tr>)}</tbody></table></div>}</section>;
}

function DealWorkspace({ deal, tab, setTab, role, tenantId, onBack, onRefresh, onNotify, onOpenDrawer, drawer }: { deal: DealDetail; tab: Tab; setTab: (tab: Tab) => void; role: Role; tenantId: string; onBack: () => void; onRefresh: () => void; onNotify: (message: string, tone?: "success" | "error") => void; onOpenDrawer: (value: "task" | "party" | "submission" | "query" | "document" | null) => void; drawer: "issuer" | "deal" | "task" | "party" | "submission" | "query" | "document" | null }) {
  const [busy, setBusy] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [reviewRequest, setReviewRequest] = useState<{ item: DealDetail["checklistItems"][number]; action: "return" | "not_applicable" } | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const nextStages = ["draft", "readiness", "due_diligence", "filing_preparation", "submitted", "regulatory_review", "approved_admitted", "closed"];
  const executeChecklistAction = async (item: DealDetail["checklistItems"][number], action: string, note = item.notes ?? "Evidence reviewed") => {
    setBusy(true);
    try { const response = await fetch(`/api/advisory/checklist/${item.id}`, { method: "PATCH", headers: apiHeaders(tenantId, role, true), body: JSON.stringify({ action, note, version: item.version }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "Checklist update failed."); setReviewRequest(null); setReviewReason(""); onNotify("Checklist item updated."); onRefresh(); } catch (error) { onNotify(error instanceof Error ? error.message : "Checklist update failed.", "error"); } finally { setBusy(false); }
  };
  const updateChecklist = (item: DealDetail["checklistItems"][number], action: string) => {
    if (action === "return" || action === "not_applicable") { setReviewRequest({ item, action }); setReviewReason(""); return; }
    void executeChecklistAction(item, action);
  };
  const downloadVersion = async (versionId: string, originalName: string) => {
    try {
      const response = await fetch(`/api/advisory/documents/${encodeURIComponent(versionId)}/download`, { headers: apiHeaders(tenantId, role) });
      if (!response.ok) throw new Error("Document download failed.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = originalName; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { onNotify(error instanceof Error ? error.message : "Document download failed.", "error"); }
  };
  const advance = async (stage: string) => {
    setBusy(true);
    try { const response = await fetch(`/api/advisory/deals/${deal.id}`, { method: "PATCH", headers: apiHeaders(tenantId, role, true), body: JSON.stringify({ stage, overrideReason }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "Stage update failed."); setOverrideReason(""); onNotify("Deal stage updated."); onRefresh(); } catch (error) { onNotify(error instanceof Error ? error.message : "Stage update failed.", "error"); } finally { setBusy(false); }
  };
  return <>
    <button className="advisory-back" onClick={onBack}>← Back to pipeline</button>
    <SectionHeader eyebrow={`${displayLabel(deal.transactionType)} · ${deal.marketSegment.toUpperCase()}`} title={deal.name} copy={`${deal.issuer.tradingName ?? deal.issuer.legalName} · ${deal.checklistTemplate.code} v${deal.checklistTemplate.version}`} action={<><span className={`status status-${statusTone(deal.stage)}`}><i />{displayLabel(deal.stage)}</span>{hasPermission(role, ADVISORY_PERMISSIONS.stageAdvance) && <BrandSelect className="bselect-inline" value="" placeholder="Advance stage…" ariaLabel="Advance deal stage" onChange={(value) => void advance(value)} options={nextStages.filter((value) => value !== deal.stage).map((value) => ({ value, label: displayLabel(value) }))} />}</>} />
    {deal.readiness.percent < 100 && hasPermission(role, ADVISORY_PERMISSIONS.stageAdvance) && <div className="advisory-warning"><b>{deal.readiness.total - deal.readiness.complete} mandatory items remain</b><input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Override reason required to advance" /></div>}
    <div className="advisory-tabs" role="tablist">{TABS.map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{displayLabel(item)}</button>)}</div>
    {tab === "overview" && <DealOverview deal={deal} />}
    {tab === "checklist" && <Checklist deal={deal} role={role} busy={busy} onAction={updateChecklist} />}
    {tab === "documents" && <RecordList title="Document register" action={hasPermission(role, ADVISORY_PERMISSIONS.documentManage) ? <button className="btn primary small" onClick={() => onOpenDrawer("document")}>Add document</button> : undefined}>{deal.documents.map((item) => <div className="advisory-record" key={item.id}><span><b>{item.title}</b><small>{displayLabel(item.documentType)} · {item.currentVersion ? `Version ${item.currentVersion.versionNo}` : item.externalUrl ? "External link" : "Expected"}</small></span><span className={`status status-${statusTone(item.status)}`}><i />{displayLabel(item.status)}</span>{item.currentVersion ? <button className="advisory-link" onClick={() => void downloadVersion(item.currentVersion!.id, item.currentVersion!.originalName)}>Download</button> : item.externalUrl ? <a href={item.externalUrl} target="_blank" rel="noreferrer">Open data room</a> : null}</div>)}</RecordList>}
    {tab === "tasks" && <RecordList title="Deal tasks" action={hasPermission(role, ADVISORY_PERMISSIONS.taskManage) ? <button className="btn primary small" onClick={() => onOpenDrawer("task")}>Add task</button> : undefined}>{deal.tasks.map((item) => <div className="advisory-record" key={item.id}><span><b>{item.title}</b><small>{item.dueDate ? `Due ${String(item.dueDate).slice(0, 10)}` : "No due date"} · {item.assignedToUserId ?? "Unassigned"}</small></span><span className={`status status-${statusTone(item.status)}`}><i />{displayLabel(item.status)}</span></div>)}</RecordList>}
    {tab === "parties" && <RecordList title="Deal team and external parties" action={hasPermission(role, ADVISORY_PERMISSIONS.dealManage) ? <button className="btn primary small" onClick={() => onOpenDrawer("party")}>Add party</button> : undefined}>{deal.parties.map((item) => <div className="advisory-record" key={item.id}><span><b>{item.organization}</b><small>{displayLabel(item.partyRole)} · {item.contactName ?? "No contact"}</small></span><span>{item.email}</span></div>)}</RecordList>}
    {tab === "submissions" && <RecordList title="Submissions and regulatory queries" action={hasPermission(role, ADVISORY_PERMISSIONS.submissionManage) ? <div className="advisory-record-actions"><button className="btn secondary small" onClick={() => onOpenDrawer("query")} disabled={deal.submissions.length === 0}>Add query</button><button className="btn primary small" onClick={() => onOpenDrawer("submission")}>Add submission</button></div> : undefined}>{deal.submissions.map((item) => <div className="advisory-submission" key={item.id}><div className="advisory-record"><span><b>{item.authority} · {displayLabel(item.submissionType)}</b><small>{item.reference ?? "Reference pending"} · response due {item.responseDueAt ? String(item.responseDueAt).slice(0, 10) : "not set"}</small></span><span className={`status status-${statusTone(item.status)}`}><i />{displayLabel(item.status)}</span></div>{item.regulatoryQueries.map((query) => <div className="advisory-query" key={query.id}><b>{query.reference ?? "Query"}</b><span>{query.question}</span><small>{displayLabel(query.status)} · due {query.dueDate ? String(query.dueDate).slice(0, 10) : "not set"}</small></div>)}</div>)}</RecordList>}
    {tab === "activity" && <RecordList title="Activity timeline">{deal.activity.map((item) => <div className="advisory-record" key={item.id}><span><b>{item.summary}</b><small>{item.actor} · {new Date(item.at).toLocaleString("en-ET")}</small></span></div>)}</RecordList>}
    {drawer && <AdvisoryDrawer kind={drawer} deal={deal} portfolio={null} tenantId={tenantId} role={role} onClose={() => onOpenDrawer(null)} onSaved={() => { onOpenDrawer(null); onRefresh(); }} onNotify={onNotify} />}
    {reviewRequest && <div className="scrim"><aside className="drawer"><button className="drawer-close" onClick={() => setReviewRequest(null)}>×</button><form className="drawer-content advisory-form" onSubmit={(event) => { event.preventDefault(); void executeChecklistAction(reviewRequest.item, reviewRequest.action, reviewReason.trim()); }}><div className="drawer-title"><span className="eyebrow">CHECKLIST REVIEW</span><h2>{reviewRequest.action === "return" ? "Return this item" : "Mark as not applicable"}</h2><p>Record the decision so the review history remains clear and auditable.</p></div><label><span>Reason</span><textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} required rows={5} /></label><div className="drawer-actions"><button type="button" className="btn secondary" onClick={() => setReviewRequest(null)}>Cancel</button><button className="btn primary" disabled={busy || !reviewReason.trim()}>{busy ? "Saving…" : "Confirm decision"}</button></div></form></aside></div>}
  </>;
}

function DealOverview({ deal }: { deal: DealDetail }) {
  return <div className="advisory-overview"><section className="panel advisory-readiness"><span>READINESS</span><strong>{deal.readiness.percent}%</strong><div className="readiness"><span><i style={{ width: `${deal.readiness.percent}%` }} /></span><b>{deal.readiness.complete}/{deal.readiness.total}</b></div><p>Mandatory checklist items with approved evidence.</p></section><section className="panel advisory-summary"><h3>Engagement summary</h3><dl><div><dt>Issuer</dt><dd>{deal.issuer.legalName}</dd></div><div><dt>Sector</dt><dd>{deal.issuer.sector ?? "Not recorded"}</dd></div><div><dt>Transaction</dt><dd>{displayLabel(deal.transactionType)} · {deal.marketSegment.toUpperCase()}</dd></div><div><dt>Target date</dt><dd>{deal.targetDate ?? "Not set"}</dd></div><div><dt>Checklist</dt><dd>{deal.checklistTemplate.title}</dd></div></dl></section></div>;
}

function Checklist({ deal, role, busy, onAction }: { deal: DealDetail; role: Role; busy: boolean; onAction: (item: DealDetail["checklistItems"][number], action: string) => void }) {
  const groups = Object.entries(Object.groupBy(deal.checklistItems, (item) => item.section));
  return <div className="advisory-checklist"><div className="regulatory-note"><b>Regulation-derived checklist</b><span>Professional validation is required. Frank manages evidence and sign-off; it does not determine legal eligibility.</span></div>{groups.map(([section, items]) => <section className="panel checklist-section" key={section}><h3>{section}</h3>{items?.map((item) => <article key={item.id}><div><span className={`status status-${statusTone(item.status)}`}><i />{displayLabel(item.status)}</span><b>{item.title}</b>{item.required && <em>Mandatory</em>}<p>{item.guidance}</p><small>Expected evidence: {item.expectedEvidence}</small>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceTitle} · {item.sourceReference}</a>}</div><div className="checklist-actions">{hasPermission(role, ADVISORY_PERMISSIONS.checklistPrepare) && !["pending_approval", "satisfied", "not_applicable"].includes(item.status) && <><button disabled={busy} className="btn secondary small" onClick={() => onAction(item, "save")}>Save progress</button><button disabled={busy} className="btn primary small" onClick={() => onAction(item, "submit")}>Submit</button></>}{hasPermission(role, ADVISORY_PERMISSIONS.checklistApprove) && item.status === "pending_approval" && <><button disabled={busy} className="btn secondary small" onClick={() => onAction(item, "return")}>Return</button><button disabled={busy} className="btn secondary small" onClick={() => onAction(item, "not_applicable")}>Not applicable</button><button disabled={busy} className="btn primary small" onClick={() => onAction(item, "approve")}>Approve</button></>}</div></article>)}</section>)}</div>;
}

function RecordList({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) { return <section className="panel advisory-records"><header><h3>{title}</h3>{action}</header><div>{children}</div></section>; }

function AdvisoryDrawer({ kind, deal, portfolio, tenantId, role, onClose, onSaved, onNotify }: { kind: "issuer" | "deal" | "task" | "party" | "submission" | "query" | "document"; deal: DealDetail | null; portfolio: Portfolio | null; tenantId: string; role: Role; onClose: () => void; onSaved: () => void; onNotify: (message: string, tone?: "success" | "error") => void }) {
  const [values, setValues] = useState<Record<string, string>>({ transactionType: "ipo", marketSegment: "main", entityType: "share_company", priority: "normal", authority: "ECMA" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      let response: Response;
      if (kind === "document") { const form = new FormData(); Object.entries(values).forEach(([key, value]) => form.set(key, value)); form.set("dealId", deal!.id); if (file) form.set("file", file); response = await fetch("/api/advisory/documents", { method: "POST", headers: apiHeaders(tenantId, role), body: form }); }
      else response = await fetch("/api/advisory", { method: "POST", headers: apiHeaders(tenantId, role, true), body: JSON.stringify({ entity: kind, dealId: deal?.id, ...values }) });
      const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "Could not save the record."); onNotify(`${displayLabel(kind)} saved.`); onSaved();
    } catch (error) { onNotify(error instanceof Error ? error.message : "Could not save the record.", "error"); } finally { setBusy(false); }
  };
  return <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="drawer"><button className="drawer-close" onClick={onClose}>×</button><form className="drawer-content advisory-form" onSubmit={submit}><div className="drawer-title"><span className="eyebrow">ISSUER ADVISORY</span><h2>Add {displayLabel(kind)}</h2><p>Record ownership and evidence without recreating the professional work itself.</p></div>{kind === "issuer" && <><Field label="Legal name" value={values.legalName} onChange={(value) => set("legalName", value)} required /><Field label="Trading name" value={values.tradingName} onChange={(value) => set("tradingName", value)} /><Field label="Registration number" value={values.registrationNumber} onChange={(value) => set("registrationNumber", value)} /><Field label="Sector" value={values.sector} onChange={(value) => set("sector", value)} /><Field label="Primary contact" value={values.contactName} onChange={(value) => set("contactName", value)} /><Field label="Contact email" value={values.contactEmail} onChange={(value) => set("contactEmail", value)} /></>}{kind === "deal" && <><Field label="Deal name" value={values.name} onChange={(value) => set("name", value)} required /><label><span>Issuer</span><BrandSelect value={values.issuerId ?? ""} onChange={(value) => set("issuerId", value)} placeholder="Choose issuer" ariaLabel="Issuer" options={(portfolio?.issuers ?? []).map((item) => ({ value: item.id, label: item.tradingName ?? item.legalName }))} /></label><label><span>Transaction</span><BrandSelect value={values.transactionType} onChange={(value) => { set("transactionType", value); set("marketSegment", value === "otc_admission" ? "otc" : "main"); }} ariaLabel="Transaction type" options={[{ value: "ipo", label: "IPO" }, { value: "otc_admission", label: "OTC admission" }]} /></label><label><span>Market segment</span><BrandSelect value={values.marketSegment} onChange={(value) => set("marketSegment", value)} ariaLabel="Market segment" options={(values.transactionType === "otc_admission" ? ["otc"] : ["main", "growth"]).map((value) => ({ value, label: value.toUpperCase() }))} /></label><Field label="Mandate reference" value={values.mandateReference} onChange={(value) => set("mandateReference", value)} /><Field label="Target date" type="date" value={values.targetDate} onChange={(value) => set("targetDate", value)} /></>}{kind === "task" && <><Field label="Task title" value={values.title} onChange={(value) => set("title", value)} required /><Field label="Description" value={values.description} onChange={(value) => set("description", value)} /><Field label="Due date" type="date" value={values.dueDate} onChange={(value) => set("dueDate", value)} /></>}{kind === "party" && <><Field label="Organization" value={values.organization} onChange={(value) => set("organization", value)} required /><Field label="Role" value={values.partyRole} onChange={(value) => set("partyRole", value)} placeholder="legal_counsel" /><Field label="Contact name" value={values.contactName} onChange={(value) => set("contactName", value)} /><Field label="Email" value={values.email} onChange={(value) => set("email", value)} /></>}{kind === "submission" && <><Field label="Authority" value={values.authority} onChange={(value) => set("authority", value)} /><Field label="Submission type" value={values.submissionType} onChange={(value) => set("submissionType", value)} required /><Field label="Reference" value={values.reference} onChange={(value) => set("reference", value)} /><Field label="Response due" type="date" value={values.responseDueAt} onChange={(value) => set("responseDueAt", value)} /></>}{kind === "query" && <><label><span>Submission</span><BrandSelect value={values.submissionId ?? ""} onChange={(value) => set("submissionId", value)} placeholder="Choose submission" ariaLabel="Submission" options={(deal?.submissions ?? []).map((item) => ({ value: item.id, label: `${item.authority} · ${item.reference ?? displayLabel(item.submissionType)}` }))} /></label><Field label="Query or question" value={values.question} onChange={(value) => set("question", value)} required /><Field label="Reference" value={values.reference} onChange={(value) => set("reference", value)} /><Field label="Response due" type="date" value={values.dueDate} onChange={(value) => set("dueDate", value)} /></>}{kind === "document" && <><Field label="Document title" value={values.title} onChange={(value) => set("title", value)} required /><Field label="Document type" value={values.documentType} onChange={(value) => set("documentType", value)} placeholder="valuation_report" /><Field label="External data-room link" value={values.externalUrl} onChange={(value) => set("externalUrl", value)} /><label><span>Upload file</span><input type="file" accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label></>}<div className="drawer-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button></div></form></aside></div>;
}

function Field({ label, value = "", onChange, type = "text", required = false, placeholder }: { label: string; value?: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) { return <label><span>{label}</span><input type={type} value={value} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
