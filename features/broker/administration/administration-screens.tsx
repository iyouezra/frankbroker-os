"use client";

import { useEffect, useMemo, useState } from "react";
import { roleLabels, workflowPermissions, type Role } from "../../../lib/frank";
import { BROKER_ASSIGNABLE_ROLES, fallbackBrokerUsers, formatAccessDate, type BrokerAssignableRole, type BrokerUserAccess } from "../../../lib/user-access";
import { BrandSelect } from "../../shared/brand-select";
import { BROKER_TENANT_ID, SectionHeader, etb } from "../shared/broker-foundation";

type SettingsFeeRule = { assetClass: string; marketSegment: string; brokeragePct: number; regulatorPct: number; exchangePct: number; csdPct: number; minimumFee: number; maximumFee: number | null };
type SettingsControls = { brokerageFeePct: number; minimumFee: number; approvalThreshold: number; clientDailyLimit: number; makerChecker: boolean; allowedOrderTypes: string[]; settlementCycle: string; feeRules: SettingsFeeRule[]; feeScheduleVersion: string; feeScheduleEffectiveFrom: string | null; regulatoryFeeScheduleVersion: string; marketFeeScheduleConfigured: boolean };
const STAFF_ROLES: Role[] = ["access_admin", "broker_admin", "trader", "operations", "compliance", "settlement", "relationship_officer", "service_officer", "management"];
const PERMISSION_COLUMNS: [string, string][] = [["create", "Create"], ["approve", "Approve"], ["reject", "Reject"], ["trade", "Trade"], ["settle", "Settle"], ["adjust", "Adjust"], ["report", "Report"]];
// Client-service rights are shown in their own matrix so neither table becomes too wide to scan.
const CRM_PERMISSION_COLUMNS: [string, string][] = [["crm.thread.view", "View"], ["crm.thread.create", "Start"], ["crm.thread.reply", "Reply"], ["crm.thread.note", "Note"], ["crm.thread.assign", "Assign"], ["crm.thread.status", "Status"], ["crm.thread.priority", "Priority"]];
const FEATURE_LABELS: Record<string, string> = { investorPortal: "Investor portal", selfDirected: "Self-directed investing", bonds: "Government bonds", recurringInvestments: "Recurring investments", institutionalAccounts: "Institutional accounts", manualTradeCapture: "Manual trade capture" };

export function SettingsPage() {
  const [tenant, setTenant] = useState<{ name: string; license: string; controls: SettingsControls | null; features: Record<string, boolean> } | null>(null);
  const [savingFees, setSavingFees] = useState(false);
  const [feeMessage, setFeeMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/tenant", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline")))
      .then((data: { tenant?: { tradingName?: string; name?: string; licenseNumber?: string; controls?: SettingsControls; features?: Record<string, boolean> } }) => {
        if (data.tenant) setTenant({ name: data.tenant.tradingName ?? data.tenant.name ?? "Abyssinia Securities", license: data.tenant.licenseNumber ?? "ESCA-BR-004", controls: data.tenant.controls ?? null, features: data.tenant.features ?? {} });
      })
      .catch(() => setTenant({ name: "Abyssinia Securities", license: "ESCA-BR-004", controls: { brokerageFeePct: 0.5, minimumFee: 25, approvalThreshold: 250000, clientDailyLimit: 2500000, makerChecker: true, allowedOrderTypes: ["Market", "Limit"], settlementCycle: "T+2", feeScheduleVersion: "1.0", feeScheduleEffectiveFrom: "2026-07-14", regulatoryFeeScheduleVersion: "not-configured", marketFeeScheduleConfigured: false, feeRules: [] }, features: { investorPortal: true, selfDirected: true, bonds: true, recurringInvestments: true, institutionalAccounts: true, manualTradeCapture: true } }));
    return () => controller.abort();
  }, []);
  const controls = tenant?.controls;
  const features = tenant?.features ?? {};
  const updateControl = (patch: Partial<SettingsControls>) => setTenant((current) => current?.controls ? { ...current, controls: { ...current.controls, ...patch } } : current);
  const updateFeeRule = (index: number, field: "brokeragePct" | "minimumFee" | "maximumFee", value: string) => {
    if (!controls) return;
    updateControl({ feeRules: controls.feeRules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [field]: field === "maximumFee" && value === "" ? null : Number(value) } : rule) });
  };
  const publishBrokerageFees = async () => {
    if (!controls) return;
    setSavingFees(true); setFeeMessage("");
    try {
      const response = await fetch("/api/tenant", { method: "PATCH", headers: { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": "broker_admin" }, body: JSON.stringify({ action: "brokerage_fee_schedule", version: controls.feeScheduleVersion, effectiveFrom: controls.feeScheduleEffectiveFrom, rules: controls.feeRules.map(({ assetClass, marketSegment, brokeragePct, minimumFee, maximumFee }) => ({ assetClass, marketSegment, brokeragePct, minimumFee, maximumFee })) }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to publish the brokerage fee schedule.");
      setFeeMessage(`Brokerage commission schedule ${controls.feeScheduleVersion} published and audit logged.`);
    } catch (error) { setFeeMessage(error instanceof Error ? error.message : "Unable to publish the brokerage fee schedule."); }
    finally { setSavingFees(false); }
  };
  return <>
    <SectionHeader eyebrow="WORKSPACE" title="Settings" copy="Your tenant configuration and team. Platform-level controls are set by Frank." />
    <div className="settings-banner"><span>SHARED CONTROL</span><p>Your brokerage manages its commission schedule. ECMA, ESX, and CSD charges come from the active Platform Admin schedule for tenants whose licence, entitlement, and enabled modules permit securities dealing.</p></div>
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">TENANT POLICY</span><h2>Trading controls</h2></div></div>
      <dl className="detail-grid settings-grid">
        <div><dt>Trading name</dt><dd>{tenant?.name ?? "-"}</dd></div>
        <div><dt>License</dt><dd>{tenant?.license || "-"}</dd></div>
        <div><dt>Approval threshold</dt><dd>{controls ? etb(controls.approvalThreshold) : "-"}</dd></div>
        <div><dt>Client daily limit</dt><dd>{controls ? etb(controls.clientDailyLimit) : "-"}</dd></div>
        <div><dt>Maker-checker</dt><dd>{controls ? (controls.makerChecker ? "Required" : "Off") : "-"}</dd></div>
        <div><dt>Settlement cycle</dt><dd>{controls?.settlementCycle ?? "-"}</dd></div>
      </dl>
    </section>
    {controls && <section className="panel brokerage-settings"><div className="panel-head"><div><span className="eyebrow">TENANT-MANAGED · VERSIONED</span><h2>Brokerage commission</h2><p>Set your own commission and minimum by instrument class. Market and regulatory rates are shown for context and cannot be edited here.</p></div><button className="btn primary" disabled={savingFees} onClick={() => void publishBrokerageFees()}>{savingFees ? "Publishing…" : "Publish commission schedule"}</button></div>
      <div className="brokerage-version-fields"><label>Version<input value={controls.feeScheduleVersion} onChange={(event) => updateControl({ feeScheduleVersion: event.target.value })} /></label><label>Effective from<input type="date" value={controls.feeScheduleEffectiveFrom ?? ""} onChange={(event) => updateControl({ feeScheduleEffectiveFrom: event.target.value })} /></label><span><small>Platform fee version</small><b>{controls.regulatoryFeeScheduleVersion}</b></span></div>
      <div className="table-scroll"><table><thead><tr><th>Instrument class</th><th className="num">Commission %</th><th className="num">Minimum ETB</th><th className="num">Maximum ETB</th><th className="num">ECMA %</th><th className="num">ESX %</th><th className="num">CSD %</th></tr></thead><tbody>{controls.feeRules.map((rule, index) => <tr key={`${rule.assetClass}-${rule.marketSegment}`}><td><b>{rule.assetClass === "bond" ? "Government bond" : "Equity"}</b><small>{rule.marketSegment}</small></td><td className="num"><input aria-label={`${rule.assetClass} commission percent`} type="number" min="0" step="0.01" value={rule.brokeragePct} onChange={(event) => updateFeeRule(index, "brokeragePct", event.target.value)} /></td><td className="num"><input aria-label={`${rule.assetClass} minimum commission`} type="number" min="0" value={rule.minimumFee} onChange={(event) => updateFeeRule(index, "minimumFee", event.target.value)} /></td><td className="num"><input aria-label={`${rule.assetClass} maximum commission`} type="number" min="0" placeholder="No cap" value={rule.maximumFee ?? ""} onChange={(event) => updateFeeRule(index, "maximumFee", event.target.value)} /></td><td className="num">{rule.regulatorPct}%</td><td className="num">{rule.exchangePct}%</td><td className="num">{rule.csdPct}%</td></tr>)}</tbody></table></div>
      {feeMessage && <div className="settings-note" role="status">{feeMessage}</div>}
    </section>}
    <section className="panel"><div className="panel-head"><div><span className="eyebrow">CAPABILITIES</span><h2>Feature access</h2></div></div>
      <div className="feature-list">{Object.entries(FEATURE_LABELS).map(([key, label]) => <span key={key} className={features[key] ? "on" : "off"}><i />{label}</span>)}</div>
    </section>
  </>;
}

export function UsersPage({ role }: { role: Role }) {
  const canManage = role === "access_admin";
  const [users, setUsers] = useState<BrokerUserAccess[]>(fallbackBrokerUsers);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState<{ user: BrokerUserAccess; action: "reset_password" | "suspend" | "restore" | "change_role"; nextRole?: BrokerAssignableRole } | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/users", { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline")))
      .then((data: { users?: BrokerUserAccess[] }) => { if (data.users?.length) setUsers(data.users); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [role]);

  const visible = useMemo(() => users.filter((user) => {
    const haystack = `${user.employeeId} ${user.fullName} ${user.email} ${user.jobTitle} ${user.department} ${roleLabels[user.role]}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase()) && (statusFilter === "all" || user.status === statusFilter);
  }), [query, statusFilter, users]);
  const active = users.filter((user) => user.status === "active").length;
  const pendingInvites = users.filter((user) => user.status === "invited").length;
  const resetPending = users.filter((user) => user.passwordResetRequired).length;
  const mfaCoverage = active ? Math.round(users.filter((user) => user.status === "active" && user.mfaEnabled).length / active * 100) : 0;
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 4000); };
  const replaceUser = (next: BrokerUserAccess) => setUsers((current) => current.map((item) => item.id === next.id ? next : item));

  const applyOfflineAction = (item: BrokerUserAccess, action: string, nextRole?: BrokerAssignableRole): BrokerUserAccess => {
    const now = new Date().toISOString();
    if (action === "reset_password") return { ...item, passwordResetRequired: true, passwordResetRequestedAt: now };
    if (action === "suspend") return { ...item, status: "suspended" };
    if (action === "restore") return { ...item, status: "active" };
    if (action === "change_role" && nextRole) return { ...item, role: nextRole };
    return { ...item, invitedAt: now, invitationExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
  };
  const runAction = async (item: BrokerUserAccess, action: "reset_password" | "suspend" | "restore" | "change_role" | "resend_invite", actionReason: string, nextRole?: BrokerAssignableRole) => {
    setBusy(`${action}:${item.id}`);
    try {
      const response = await fetch("/api/users", { method: "PATCH", headers: { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": "access_admin" }, body: JSON.stringify({ id: item.id, action, reason: actionReason, role: nextRole }) });
      const result = await response.json().catch(() => ({})) as { user?: BrokerUserAccess; error?: string; delivery?: "sent" | "deferred" };
      if (!response.ok) throw new Error(result.error ?? "Unable to update access.");
      if (result.user) replaceUser(result.user);
      flash(action === "reset_password" && result.delivery === "deferred" ? "Password reset recorded. Delivery will activate with the identity provider." : action === "resend_invite" && result.delivery === "deferred" ? "Invitation renewed. Delivery will activate with the identity provider." : "Access change recorded and audit logged.");
    } catch (error) {
      replaceUser(applyOfflineAction(item, action, nextRole));
      flash(error instanceof Error && !error.message.includes("fetch") ? error.message : "Access change recorded in the offline demo.");
    } finally { setBusy(""); setPending(null); setReason(""); }
  };

  return <>
    <SectionHeader eyebrow="ACCESS ADMINISTRATION" title="Employees &amp; access" copy="Your brokerage owns employee invitations, role assignment, password recovery, and access removal." action={canManage ? <button className="btn primary" onClick={() => setInviteOpen(true)}>＋ Invite employee</button> : undefined} />
    <div className="settings-banner"><span>BROKER MANAGED</span><p>{canManage ? "You can manage ordinary employee access. Frank can view access health but intervenes only for access-admin bootstrap or recovery." : "Broker access administrators manage employee access. This operational administrator view is read-only."}</p></div>
    <div className="access-metrics">
      <article className="panel"><small>ACTIVE EMPLOYEES</small><b>{active}</b><span>{users.length} total records</span></article>
      <article className="panel"><small>MFA READINESS</small><b>{mfaCoverage}%</b><span>Enforced when identity is connected</span></article>
      <article className="panel"><small>PENDING INVITATIONS</small><b>{pendingInvites}</b><span>Seven-day invitation window</span></article>
      <article className="panel"><small>RESET REQUESTS</small><b>{resetPending}</b><span>Awaiting identity-provider completion</span></article>
    </div>
    <section className="panel table-panel access-team-panel">
      <div className="panel-head"><div><span className="eyebrow">EMPLOYEE DIRECTORY</span><h2>Workspace access</h2></div><div className="access-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee ID, name or role…" aria-label="Search employees" /><BrandSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Access status" options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "invited", label: "Invited" }, { value: "suspended", label: "Suspended" }]} /></div></div>
      <div className="table-scroll"><table className="access-team-table"><thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Status</th><th>Last active</th><th>Actions</th></tr></thead><tbody>
        {visible.map((user) => {
          const protectedAdmin = user.role === "access_admin";
          const statusTone = user.status === "active" ? "success" : user.status === "invited" ? "warning" : "danger";
          return <tr key={user.id}><td><span className="access-person"><i>{user.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</i><span><b>{user.fullName}</b><small>{user.employeeId} · {user.email}</small><em>{user.jobTitle}</em></span></span></td><td><b>{user.department || "—"}</b><small>{user.mfaEnabled ? "MFA ready" : "MFA pending"}</small></td><td><BrandSelect value={user.role} disabled={!canManage || protectedAdmin || user.status === "suspended"} onChange={(next) => setPending({ user, action: "change_role", nextRole: next as BrokerAssignableRole })} ariaLabel={`${user.fullName} role`} options={protectedAdmin ? [{ value: "access_admin", label: roleLabels.access_admin }] : BROKER_ASSIGNABLE_ROLES.map((item) => ({ value: item, label: roleLabels[item] }))} />{protectedAdmin && <small>Frank recovery controlled</small>}</td><td><span className={`status status-${statusTone}`}><i />{user.status === "active" ? "Active" : user.status === "invited" ? "Invited" : "Suspended"}</span>{user.passwordResetRequired && <small>Reset requested</small>}</td><td><b>{formatAccessDate(user.lastLoginAt)}</b><small>{user.accessReviewDueAt ? `Review ${formatAccessDate(user.accessReviewDueAt)}` : "Review not scheduled"}</small></td><td><div className="access-row-actions">{canManage && <>{user.status === "invited" ? <button disabled={Boolean(busy)} onClick={() => void runAction(user, "resend_invite", "Invitation renewed by access administrator")}>Resend invite</button> : <button disabled={Boolean(busy)} onClick={() => setPending({ user, action: "reset_password" })}>Reset password</button>}{!protectedAdmin && user.status !== "invited" && <button className={user.status === "suspended" ? "" : "danger-link"} disabled={Boolean(busy)} onClick={() => setPending({ user, action: user.status === "suspended" ? "restore" : "suspend" })}>{user.status === "suspended" ? "Restore" : "Suspend"}</button>}</>}</div></td></tr>;
        })}
        {!visible.length && <tr><td colSpan={6}><div className="access-empty"><b>No employees match these filters</b><span>Try another employee ID, name, role, or status.</span></div></td></tr>}
      </tbody></table></div>
      <div className="settings-note">Access-admin appointments and recovery are protected platform workflows. Every invitation, role change, reset request, suspension, and restoration is recorded in the tenant audit trail.</div>
    </section>
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">CONTROL MATRIX</span><h2>Trading &amp; operations</h2></div></div>
      <div className="table-scroll"><table><thead><tr><th>Role</th>{PERMISSION_COLUMNS.map(([key, label]) => <th key={key} className="num">{label}</th>)}</tr></thead><tbody>
        {STAFF_ROLES.map((staffRole) => <tr key={staffRole}><td><b>{roleLabels[staffRole]}</b></td>{PERMISSION_COLUMNS.map(([key]) => <td key={key} className="num">{workflowPermissions[staffRole].includes(key) ? <span className="perm-yes">✓</span> : <span className="perm-no">–</span>}</td>)}</tr>)}
      </tbody></table></div>
      <div className="settings-note">Permissions are set by role. Segregation of duties is enforced server-side: the maker of an order or onboarding record cannot approve it.</div>
    </section>
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">CONTROL MATRIX</span><h2>Client service</h2></div></div>
      <div className="table-scroll"><table><thead><tr><th>Role</th>{CRM_PERMISSION_COLUMNS.map(([key, label]) => <th key={key} className="num">{label}</th>)}</tr></thead><tbody>
        {STAFF_ROLES.map((staffRole) => <tr key={staffRole}><td><b>{roleLabels[staffRole]}</b></td>{CRM_PERMISSION_COLUMNS.map(([key]) => <td key={key} className="num">{workflowPermissions[staffRole].includes(key) ? <span className="perm-yes">✓</span> : <span className="perm-no">–</span>}</td>)}</tr>)}
      </tbody></table></div>
      <div className="settings-note">Replying to an investor is separate from adding an internal note. Internal notes are never shown to investors.</div>
    </section>
    {inviteOpen && <InviteEmployeeDialog onClose={() => setInviteOpen(false)} onInvited={(user, delivery) => { setUsers((current) => [...current, user]); setInviteOpen(false); flash(delivery === "deferred" ? "Employee recorded. Invitation delivery will activate with the identity provider." : "Employee invited and audit logged."); }} />}
    {pending && <AccessActionDialog pending={pending} reason={reason} setReason={setReason} busy={Boolean(busy)} onClose={() => { setPending(null); setReason(""); }} onConfirm={() => void runAction(pending.user, pending.action, reason, pending.nextRole)} />}
    {notice && <div className="broker-access-toast" role="status"><i>✓</i><span>{notice}</span></div>}
  </>;
}

function InviteEmployeeDialog({ onClose, onInvited }: { onClose: () => void; onInvited: (user: BrokerUserAccess, delivery?: "sent" | "deferred") => void }) {
  const [value, setValue] = useState({ employeeId: "", fullName: "", email: "", jobTitle: "", department: "", role: "operations" as BrokerAssignableRole, reason: "New employee access" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof value, next: string) => setValue((current) => ({ ...current, [key]: next }));
  const valid = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/.test(value.employeeId.trim()) && value.fullName.trim().length >= 3 && value.email.includes("@") && Boolean(value.jobTitle.trim()) && Boolean(value.department.trim());
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!valid) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": "access_admin" }, body: JSON.stringify(value) });
      const result = await response.json().catch(() => ({})) as { user?: BrokerUserAccess; error?: string; delivery?: "sent" | "deferred" };
      if (!response.ok || !result.user) throw new Error(result.error ?? "Unable to invite employee.");
      onInvited(result.user, result.delivery);
    } catch (caught) {
      if (caught instanceof Error && !caught.message.includes("fetch")) setError(caught.message);
      else onInvited({ id: `usr_${Date.now()}`, employeeId: value.employeeId.toUpperCase(), fullName: value.fullName, email: value.email.toLowerCase(), jobTitle: value.jobTitle, department: value.department, role: value.role, status: "invited", mfaEnabled: false, authProvider: "pending", lastLoginAt: null, invitedAt: new Date().toISOString(), invitationExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), passwordResetRequired: false, passwordResetRequestedAt: null, accessReviewDueAt: new Date(Date.now() + 90 * 86400000).toISOString() }, "deferred");
    } finally { setBusy(false); }
  };
  return <div className="broker-access-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><form className="broker-access-dialog invite-employee-dialog" onSubmit={(event) => void submit(event)}><span>NEW EMPLOYEE ACCESS</span><h2>Invite an employee</h2><p>Record the employee identity and assign one role. Access-admin appointments remain a Frank recovery-controlled workflow.</p><div className="access-form-grid"><label><span>Employee ID</span><input autoFocus value={value.employeeId} onChange={(event) => set("employeeId", event.target.value.toUpperCase())} placeholder="e.g. ABS-0184" /></label><label><span>Full legal name</span><input value={value.fullName} onChange={(event) => set("fullName", event.target.value)} placeholder="Employee name" /></label><label><span>Work email</span><input type="email" value={value.email} onChange={(event) => set("email", event.target.value)} placeholder="name@broker.et" /></label><label><span>Job title</span><input value={value.jobTitle} onChange={(event) => set("jobTitle", event.target.value)} placeholder="Operations Officer" /></label><label><span>Department</span><input value={value.department} onChange={(event) => set("department", event.target.value)} placeholder="Operations" /></label><label><span>Workspace role</span><BrandSelect value={value.role} onChange={(next) => setValue((current) => ({ ...current, role: next as BrokerAssignableRole }))} ariaLabel="Workspace role" options={BROKER_ASSIGNABLE_ROLES.map((item) => ({ value: item, label: roleLabels[item] }))} /></label></div>{value.role === "broker_admin" && <div className="access-risk-note"><b>Broad operational role</b><span>This role can create, approve, trade, settle, and adjust. Use a specialist role wherever possible.</span></div>}{error && <div className="access-form-error">{error}</div>}<footer><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid || busy}>{busy ? "Recording…" : "Record invitation"}</button></footer></form></div>;
}

function AccessActionDialog({ pending, reason, setReason, busy, onClose, onConfirm }: { pending: { user: BrokerUserAccess; action: "reset_password" | "suspend" | "restore" | "change_role"; nextRole?: BrokerAssignableRole }; reason: string; setReason: (value: string) => void; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const labels = { reset_password: "Reset password", suspend: "Suspend access", restore: "Restore access", change_role: "Change employee role" } as const;
  const descriptions = {
    reset_password: "This invalidates the employee's current password when authentication is connected and records a reset request now.",
    suspend: "The employee will be blocked from the broker workspace. Existing audit history remains intact.",
    restore: "The employee's workspace access will be restored and a new access-review date scheduled.",
    change_role: `Change from ${roleLabels[pending.user.role]} to ${pending.nextRole ? roleLabels[pending.nextRole] : "the selected role"}.`,
  } as const;
  return <div className="broker-access-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="broker-access-dialog"><span>CONTROLLED ACCESS CHANGE</span><h2>{labels[pending.action]}</h2><p><b>{pending.user.fullName}</b> · {pending.user.employeeId}<br />{descriptions[pending.action]}</p><label><span>Reason for audit trail</span><textarea autoFocus rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record the business or support reason…" /></label><footer><button className="btn secondary" disabled={busy} onClick={onClose}>Cancel</button><button className={`btn ${pending.action === "suspend" ? "danger" : "primary"}`} disabled={reason.trim().length < 5 || busy} onClick={onConfirm}>{busy ? "Recording…" : labels[pending.action]}</button></footer></section></div>;
}
