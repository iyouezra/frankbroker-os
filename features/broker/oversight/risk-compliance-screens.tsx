"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role } from "../../../lib/frank";
import { EmptyState, Metric, SectionHeader, displayLabel } from "../shared/broker-foundation";

type Mode = "overview" | "monitoring" | "clients" | "employee" | "controls";
type Overview = { aggregates: Array<{ category: string; severity: string; _count: number }>; heldCash: number; heldOrders: number; openCases: number; upcomingDeadlines: number; sensitive: boolean };
type Alert = { id: string; category: string; ruleCode: string; severity: string; status: string; investigationStatus: string; clearanceStatus: string; title: string; summary: string; detectedAt: string; client?: { clientCode: string; fullName: string } | null; case?: { referenceNumber: string; status: string } | null };
type MonitoringCase = { id: string; referenceNumber: string; category: string; title: string; priority: string; status: string; dueAt: string | null; _count: { alerts: number; events: number; evidence: number } };
type Rule = { ruleCode: string; category: string; title: string; version: number; enabled: boolean; configuration: Record<string, unknown> };
type MonitoringAudit = { id: string; action: string; entityType: string; entityId: string; summary: string; createdAt: string };
type EmployeeData = {
  profiles: Array<{ id: string; faydaLast7: string; sensitiveMarketAccess: boolean; status: string; user: { fullName: string; role: string; email: string }; linkedClient?: { clientCode: string } | null; linkedAccount?: { accountNumber: string } | null }>;
  clearances: Array<{ id: string; side: string; businessDate: string; maxQuantity: string | null; maxValue: string | null; status: string; employeeProfile: { user: { fullName: string } }; instrument: { symbol: string; name: string } }>;
  restrictions: Array<{ id: string; classification: string; reason: string; effectiveFrom: string; effectiveTo: string | null; instrument: { symbol: string; name: string } }>;
  disclosures: Array<{ id: string; disclosureType: string; title: string; status: string; createdAt: string; employeeProfile: { user: { fullName: string } } }>;
  attestations: Array<{ id: string; attestationYear: number; status: string; employeeProfile: { user: { fullName: string } } }>;
  sensitiveAccess: Array<{ id: string; reason: string; receivedAt: string; releasedAt: string | null; employeeProfile: { user: { fullName: string } }; instrument: { symbol: string; name: string } }>;
  users: Array<{ id: string; fullName: string; email: string; role: string }>;
  instruments: Array<{ id: string; symbol: string; name: string }>;
};

const emptyOverview: Overview = { aggregates: [], heldCash: 0, heldOrders: 0, openCases: 0, upcomingDeadlines: 0, sensitive: false };

function badge(value: string) {
  const tone = value === "critical" || value === "blocked" || value === "restricted" ? "danger" : value === "high" || value === "pending" || value === "required" ? "warning" : value === "cleared" || value === "approved" || value === "active" ? "success" : "neutral";
  return <span className={`status status-${tone}`}><i />{displayLabel(value)}</span>;
}

export function RiskComplianceWorkspace({ mode, role, tenantId, onNotify }: { mode: Mode; role: Role; tenantId: string; onNotify: (message: string, tone?: "success" | "error") => void }) {
  const [overview, setOverview] = useState(emptyOverview);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [cases, setCases] = useState<MonitoringCase[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [monitoringAudit, setMonitoringAudit] = useState<MonitoringAudit[]>([]);
  const [employees, setEmployees] = useState<EmployeeData>({ profiles: [], clearances: [], restrictions: [], disclosures: [], attestations: [], sensitiveAccess: [], users: [], instruments: [] });
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<{ alert: Alert; action: "clear" | "block" | "close_false_positive" } | null>(null);
  const [rationale, setRationale] = useState("");
  const [employeeAction, setEmployeeAction] = useState<"enroll" | "clearance" | "restriction" | "information">("enroll");
  const [employeeForm, setEmployeeForm] = useState({ userId: "", faydaId: "", sensitiveMarketAccess: false, employeeProfileId: "", instrumentId: "", side: "buy", maxQuantity: "", maxValue: "", classification: "watch", reason: "" });
  const [ruleDecision, setRuleDecision] = useState<Rule | null>(null);
  const [ruleReason, setRuleReason] = useState("");
  const headers = useMemo(() => ({ "x-frank-tenant-id": tenantId, "x-frank-demo-role": role }), [role, tenantId]);
  const sensitive = role === "compliance";

  const load = useCallback(async () => {
    try {
      const summaryResponse = await fetch("/api/compliance/monitoring/overview", { headers });
      if (!summaryResponse.ok) throw new Error("Risk and compliance summary is unavailable.");
      setOverview(await summaryResponse.json());
      if (sensitive && ["monitoring", "clients", "controls"].includes(mode)) {
        const [alertsResponse, casesResponse, rulesResponse] = await Promise.all([
          fetch("/api/compliance/monitoring/alerts", { headers }),
          fetch("/api/compliance/monitoring/cases", { headers }),
          fetch("/api/compliance/monitoring/rules", { headers }),
        ]);
        if (alertsResponse.ok) setAlerts((await alertsResponse.json()).alerts ?? []);
        if (casesResponse.ok) setCases((await casesResponse.json()).cases ?? []);
        if (rulesResponse.ok) {
          const result = await rulesResponse.json();
          setRules(result.rules ?? []);
          setMonitoringAudit(result.audit ?? []);
        }
      }
      if (sensitive && mode === "employee") {
        const response = await fetch("/api/compliance/employee-conduct", { headers });
        if (response.ok) setEmployees(await response.json());
      }
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Risk and compliance data is unavailable.", "error");
    } finally { setLoading(false); }
  }, [headers, mode, onNotify, sensitive]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const actAlert = async (alert: Alert, action: "review" | "clear" | "block" | "close_false_positive", decisionRationale = "") => {
    const response = await fetch(`/api/compliance/monitoring/alerts/${alert.id}/action`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ action, rationale: decisionRationale.trim() }) });
    const result = await response.json();
    if (!response.ok) return onNotify(result.error ?? "Alert action failed.", "error");
    onNotify("Alert decision recorded.");
    setDecision(null);
    setRationale("");
    await load();
  };

  const runSweep = async () => {
    const response = await fetch("/api/compliance/monitoring/sweep", { method: "POST", headers });
    const result = await response.json();
    if (!response.ok) return onNotify(result.error ?? "Client review sweep failed.", "error");
    onNotify(`Client monitoring completed · ${result.alerts ?? 0} alert records evaluated.`);
    await load();
  };

  const postEmployeeAction = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/compliance/employee-conduct", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) return onNotify(result.error ?? "Employee-conduct action failed.", "error");
    onNotify("Employee-conduct record saved.");
    setEmployeeForm((current) => ({ ...current, faydaId: "", maxQuantity: "", maxValue: "", reason: "" }));
    await load();
  };

  const submitEmployeeAction = () => {
    if (employeeAction === "enroll") return postEmployeeAction({ action: "enroll", userId: employeeForm.userId, faydaId: employeeForm.faydaId, sensitiveMarketAccess: employeeForm.sensitiveMarketAccess });
    if (employeeAction === "clearance") return postEmployeeAction({ action: "request_clearance", employeeProfileId: employeeForm.employeeProfileId, instrumentId: employeeForm.instrumentId, side: employeeForm.side, maxQuantity: employeeForm.maxQuantity, maxValue: employeeForm.maxValue });
    if (employeeAction === "restriction") return postEmployeeAction({ action: "restrict_security", instrumentId: employeeForm.instrumentId, classification: employeeForm.classification, reason: employeeForm.reason });
    return postEmployeeAction({ action: "sensitive_information", employeeProfileId: employeeForm.employeeProfileId, instrumentId: employeeForm.instrumentId, reason: employeeForm.reason });
  };

  const toggleRule = async () => {
    if (!ruleDecision || !ruleReason.trim()) return;
    const response = await fetch("/api/compliance/monitoring/rules", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ruleCode: ruleDecision.ruleCode, enabled: !ruleDecision.enabled, configuration: ruleDecision.configuration, reason: ruleReason.trim() }) });
    const result = await response.json();
    if (!response.ok) return onNotify(result.error ?? "Rule change failed.", "error");
    onNotify(`${ruleDecision.ruleCode} ${ruleDecision.enabled ? "disabled" : "enabled"} in a new version.`);
    setRuleDecision(null); setRuleReason("");
    await load();
  };

  const categoryCount = (category: string) => overview.aggregates.filter((item) => item.category === category).reduce((sum, item) => sum + item._count, 0);
  const filteredAlerts = mode === "clients" ? alerts.filter((alert) => alert.category === "aml" && ["AML_P7", "AML_P8_KYC", "AML_P8_SCREENING"].includes(alert.ruleCode)) : alerts;

  if (mode === "overview") return <>
    <SectionHeader eyebrow="RISK & COMPLIANCE" title="Control overview" copy={sensitive ? "Open AML and conduct alerts, held activity, investigation ageing, cases and deadlines." : "Anonymous control totals for management oversight. Sensitive client and employee details are restricted to Compliance."} />
    <section className="metric-grid">
      <Metric label="Open AML alerts" value={String(categoryCount("aml"))} note="Across enabled client rules" tone={categoryCount("aml") ? "warning" : "success"} />
      <Metric label="Conduct alerts" value={String(categoryCount("employee_conduct"))} note="Personal dealing and internal conduct" tone={categoryCount("employee_conduct") ? "danger" : "success"} />
      <Metric label="Held cash / orders" value={`${overview.heldCash} / ${overview.heldOrders}`} note="Awaiting compliance clearance" tone={overview.heldCash + overview.heldOrders ? "danger" : "success"} />
      <Metric label="Open cases" value={String(overview.openCases)} note={`${overview.upcomingDeadlines} deadlines within seven days`} tone={overview.upcomingDeadlines ? "warning" : "brand"} />
    </section>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">ACCESS BOUNDARY</span><h2>{loading ? "Loading control state…" : "Restricted by design"}</h2></div></div><div className="panel-body"><p>Compliance receives the investigation detail. Operations and traders only receive a generic clearance requirement on the affected workflow. Broker administrators and management receive these aggregate totals; platform administrators receive neither.</p></div></section>
  </>;

  if (mode === "employee") return <>
    <SectionHeader eyebrow="INTERNAL CONDUCT" title="Employee conduct" copy="In-house employee accounts, personal-trade clearances, restricted securities, disclosures and annual attestations." />
    <section className="panel cash-capture"><div className="panel-head"><div><span className="eyebrow">CONTROL ENTRY</span><h2>Record an employee control</h2></div><div className="chart-toggle">{(["enroll", "clearance", "restriction", "information"] as const).map((item) => <button key={item} className={employeeAction === item ? "active" : ""} onClick={() => setEmployeeAction(item)}>{displayLabel(item)}</button>)}</div></div><div className="cash-capture-grid">
      {employeeAction === "enroll" ? <><label>Employee<select value={employeeForm.userId} onChange={(event) => setEmployeeForm((current) => ({ ...current, userId: event.target.value }))}><option value="">Select employee</option>{employees.users.map((user) => <option key={user.id} value={user.id}>{user.fullName} · {displayLabel(user.role)}</option>)}</select></label><label>Fayda FAN<input value={employeeForm.faydaId} onChange={(event) => setEmployeeForm((current) => ({ ...current, faydaId: event.target.value.replace(/\D/g, "").slice(0, 16) }))} inputMode="numeric" placeholder="16 digits; never stored raw" /></label><label><input type="checkbox" checked={employeeForm.sensitiveMarketAccess} onChange={(event) => setEmployeeForm((current) => ({ ...current, sensitiveMarketAccess: event.target.checked }))} /> Other designated sensitive-market access</label></>
        : <><label>Employee profile<select value={employeeForm.employeeProfileId} onChange={(event) => setEmployeeForm((current) => ({ ...current, employeeProfileId: event.target.value }))}><option value="">Select profile</option>{employees.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.user.fullName}</option>)}</select></label><label>Instrument<select value={employeeForm.instrumentId} onChange={(event) => setEmployeeForm((current) => ({ ...current, instrumentId: event.target.value }))}><option value="">Select instrument</option>{employees.instruments.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.symbol} · {instrument.name}</option>)}</select></label>{employeeAction === "clearance" ? <><label>Side<select value={employeeForm.side} onChange={(event) => setEmployeeForm((current) => ({ ...current, side: event.target.value }))}><option value="buy">Buy</option><option value="sell">Sell</option></select></label><label>Maximum quantity<input type="number" min="0" value={employeeForm.maxQuantity} onChange={(event) => setEmployeeForm((current) => ({ ...current, maxQuantity: event.target.value }))} /></label><label>Maximum value (ETB)<input type="number" min="0" value={employeeForm.maxValue} onChange={(event) => setEmployeeForm((current) => ({ ...current, maxValue: event.target.value }))} /></label></> : employeeAction === "restriction" ? <><label>Classification<select value={employeeForm.classification} onChange={(event) => setEmployeeForm((current) => ({ ...current, classification: event.target.value }))}><option value="watch">Watch</option><option value="restricted">Restricted</option></select></label><label>Reason<input value={employeeForm.reason} onChange={(event) => setEmployeeForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Control basis" /></label></> : <label>Information received / reason<input value={employeeForm.reason} onChange={(event) => setEmployeeForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Price-sensitive information basis" /></label>}</>}
    </div><div className="cash-capture-foot"><p>{employeeAction === "enroll" ? "The raw Fayda FAN is used once to derive the same deterministic client identity reference, then discarded." : employeeAction === "clearance" ? "Clearance is valid only for today's Addis Ababa business date and needs another authorized approver." : employeeAction === "restriction" ? "Restricted instruments cannot be approved or ordered; watch instruments require review." : "An employee cannot trade this instrument until Compliance records release of the information restriction."}</p><button className="btn primary" onClick={() => void submitEmployeeAction()}>Save control</button></div></section>
    <section className="metric-grid">
      <Metric label="Conduct profiles" value={String(employees.profiles.length)} note={`${employees.profiles.filter((item) => item.linkedAccount).length} linked in-house accounts`} tone="brand" />
      <Metric label="Pending clearances" value={String(employees.clearances.filter((item) => item.status === "pending").length)} note="Separate-user decision required" tone="warning" />
      <Metric label="Restricted / watch" value={String(employees.restrictions.filter((item) => !item.effectiveTo || new Date(item.effectiveTo) > new Date()).length)} note="Active instrument controls" tone="danger" />
      <Metric label="Open disclosures" value={String(employees.disclosures.filter((item) => item.status !== "closed").length)} note="Conflicts, outside business, roles and gifts" tone="purple" />
    </section>
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">EMPLOYEE ACCOUNTS</span><h2>Conduct profiles</h2></div></div><div className="table-scroll"><table><thead><tr><th>Employee</th><th>Access</th><th>Fayda reference</th><th>In-house account</th><th>Status</th></tr></thead><tbody>{employees.profiles.map((item) => <tr key={item.id}><td><b>{item.user.fullName}</b><small>{item.user.email}</small></td><td>{displayLabel(item.user.role)}{item.sensitiveMarketAccess ? " · designated" : ""}</td><td>•••• {item.faydaLast7}</td><td>{item.linkedClient?.clientCode ?? "Not linked"}{item.linkedAccount ? ` · ${item.linkedAccount.accountNumber}` : ""}</td><td>{badge(item.status)}</td></tr>)}</tbody></table></div>{!employees.profiles.length && <EmptyState title="No conduct profiles" copy="Compliance can enrol an employee with a Fayda FAN; only the deterministic reference and final seven digits are stored." />}</section>
    <div className="perf-grid"><section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">PERSONAL DEALING</span><h2>Clearance queue</h2></div></div><div className="table-scroll"><table><thead><tr><th>Employee</th><th>Security</th><th>Side</th><th>Date</th><th>Status</th><th /></tr></thead><tbody>{employees.clearances.map((item) => <tr key={item.id}><td>{item.employeeProfile.user.fullName}</td><td><b>{item.instrument.symbol}</b></td><td>{displayLabel(item.side)}</td><td>{new Date(item.businessDate).toLocaleDateString()}</td><td>{badge(item.status)}</td><td>{item.status === "pending" && <button onClick={() => void postEmployeeAction({ action: "decide_clearance", clearanceId: item.id, decision: "approved", reason: "Approved after compliance review" })}>Approve</button>}</td></tr>)}</tbody></table></div></section><section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">INSTRUMENT CONTROLS</span><h2>Restricted and watch list</h2></div></div><div className="table-scroll"><table><thead><tr><th>Security</th><th>Class</th><th>Reason</th></tr></thead><tbody>{employees.restrictions.map((item) => <tr key={item.id}><td><b>{item.instrument.symbol}</b></td><td>{badge(item.classification)}</td><td>{item.reason}</td></tr>)}</tbody></table></div></section></div>
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">PRICE-SENSITIVE INFORMATION</span><h2>Information access list</h2></div></div><div className="table-scroll"><table><thead><tr><th>Employee</th><th>Security</th><th>Reason</th><th>Received</th><th>Status</th><th /></tr></thead><tbody>{employees.sensitiveAccess.map((item) => <tr key={item.id}><td>{item.employeeProfile.user.fullName}</td><td><b>{item.instrument.symbol}</b></td><td>{item.reason}</td><td>{new Date(item.receivedAt).toLocaleString()}</td><td>{badge(item.releasedAt ? "released" : "active")}</td><td>{!item.releasedAt && <button onClick={() => void postEmployeeAction({ action: "release_sensitive_information", accessId: item.id })}>Release</button>}</td></tr>)}</tbody></table></div></section>
  </>;

  if (mode === "controls") return <>
    <SectionHeader eyebrow="CONTROLS & AUDIT" title="Versioned monitoring rules" copy="CCO-controlled parameters and immutable version history. Changes are attributable and do not rewrite prior alert decisions." />
    <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Rule</th><th>Category</th><th>Version</th><th>Parameters</th><th>Status</th><th /></tr></thead><tbody>{rules.map((rule) => <tr key={rule.ruleCode}><td><b>{rule.ruleCode}</b><small>{rule.title}</small></td><td>{displayLabel(rule.category)}</td><td>v{rule.version}</td><td><code>{JSON.stringify(rule.configuration)}</code></td><td>{badge(rule.enabled ? "active" : "disabled")}</td><td><button onClick={() => { setRuleDecision(rule); setRuleReason(""); }}>{rule.enabled ? "Disable" : "Enable"}</button></td></tr>)}</tbody></table></div></section>
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">RESTRICTED AUDIT</span><h2>Monitoring events</h2></div><p>Excluded from general audit exports</p></div><div className="table-scroll"><table><thead><tr><th>Time</th><th>Action</th><th>Record</th><th>Summary</th></tr></thead><tbody>{monitoringAudit.map((event) => <tr key={event.id}><td>{new Date(event.createdAt).toLocaleString()}</td><td><b>{displayLabel(event.action)}</b></td><td>{displayLabel(event.entityType)} · {event.entityId}</td><td>{event.summary}</td></tr>)}</tbody></table></div></section>
    {ruleDecision && <div className="cash-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRuleDecision(null); }}><section className="cash-dialog" role="dialog" aria-modal="true" aria-labelledby="rule-decision-title"><span className="eyebrow">VERSIONED RULE CHANGE</span><h2 id="rule-decision-title">{ruleDecision.enabled ? "Disable" : "Enable"} {ruleDecision.ruleCode}</h2><p>The existing version remains immutable. This creates a new effective version with the same parameters.</p><label>Change reason<input autoFocus value={ruleReason} onChange={(event) => setRuleReason(event.target.value)} placeholder="CCO rationale" /></label><div><button className="btn secondary" onClick={() => setRuleDecision(null)}>Cancel</button><button className="btn primary" disabled={!ruleReason.trim()} onClick={() => void toggleRule()}>Create new version</button></div></section></div>}
  </>;

  return <>
    <SectionHeader eyebrow={mode === "clients" ? "CLIENT REVIEWS" : "MONITORING & CASES"} title={mode === "clients" ? "KYC, screening and shared identifiers" : "AML and employee-conduct queues"} copy={mode === "clients" ? "Exact verified identifiers, beneficial owners, overdue KYC and screening results. Addresses and masked identifiers are excluded." : "Investigation state is separate from cash and order clearance, so operational holds remain explicit."} action={mode === "clients" ? <button className="primary-button" onClick={() => void runSweep()}>Run client review</button> : undefined} />
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">ALERT QUEUE</span><h2>{mode === "clients" ? "Client review alerts" : "Open monitoring alerts"}</h2></div></div><div className="table-scroll"><table><thead><tr><th>Severity</th><th>Alert</th><th>Subject</th><th>Investigation</th><th>Clearance</th><th>Detected</th>{mode === "monitoring" && <th />}</tr></thead><tbody>{filteredAlerts.map((alert) => <tr key={alert.id}><td>{badge(alert.severity)}</td><td><b>{alert.title}</b><small>{alert.ruleCode} · {alert.summary}</small></td><td>{alert.client ? <><b>{alert.client.clientCode}</b><small>{alert.client.fullName}</small></> : "Internal"}</td><td>{badge(alert.investigationStatus)}</td><td>{badge(alert.clearanceStatus)}</td><td>{new Date(alert.detectedAt).toLocaleString()}</td>{mode === "monitoring" && <td><div className="row-actions"><button onClick={() => void actAlert(alert, "review")}>Review</button>{alert.clearanceStatus !== "cleared" && <button onClick={() => { setDecision({ alert, action: "clear" }); setRationale(""); }}>Clear</button>}</div></td>}</tr>)}</tbody></table></div>{!filteredAlerts.length && !loading && <EmptyState title="No alerts in this queue" copy="Monitoring is quiet for the selected tenant and filter." />}</section>
    {mode === "monitoring" && <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">INVESTIGATIONS</span><h2>Cases and deadlines</h2></div></div><div className="table-scroll"><table><thead><tr><th>Reference</th><th>Case</th><th>Priority</th><th>Deadline</th><th>Records</th><th>Status</th></tr></thead><tbody>{cases.map((item) => <tr key={item.id}><td><b>{item.referenceNumber}</b></td><td>{item.title}<small>{displayLabel(item.category)}</small></td><td>{badge(item.priority)}</td><td>{item.dueAt ? new Date(item.dueAt).toLocaleDateString() : "Not set"}</td><td>{item._count.alerts} alerts · {item._count.evidence} evidence</td><td>{badge(item.status)}</td></tr>)}</tbody></table></div></section>}
    {decision && <div className="cash-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDecision(null); }}><section className="cash-dialog" role="dialog" aria-modal="true" aria-labelledby="monitoring-decision-title"><span className="eyebrow">COMPLIANCE DECISION</span><h2 id="monitoring-decision-title">{displayLabel(decision.action)} alert</h2><p>{decision.alert.title} · {decision.alert.id}</p><label>Decision rationale<input autoFocus value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Record the evidence and basis for this decision" /></label><div><button className="btn secondary" onClick={() => setDecision(null)}>Cancel</button><button className="btn primary" disabled={!rationale.trim()} onClick={() => void actAlert(decision.alert, decision.action, rationale)}>Record decision</button></div></section></div>}
  </>;
}
