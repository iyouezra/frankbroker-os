"use client";

import { useEffect, useState } from "react";
import { roleLabels, workflowPermissions, type Role } from "../../../lib/frank";
import { BROKER_TENANT_ID, SectionHeader, etb, roleNames } from "../shared/broker-foundation";

type SettingsFeeRule = { assetClass: string; marketSegment: string; brokeragePct: number; regulatorPct: number; exchangePct: number; csdPct: number; minimumFee: number; maximumFee: number | null };
type SettingsControls = { brokerageFeePct: number; minimumFee: number; approvalThreshold: number; clientDailyLimit: number; makerChecker: boolean; allowedOrderTypes: string[]; settlementCycle: string; feeRules: SettingsFeeRule[]; feeScheduleVersion: string; feeScheduleEffectiveFrom: string | null; regulatoryFeeScheduleVersion: string };
const STAFF_ROLES: Role[] = ["broker_admin", "trader", "operations", "compliance", "settlement", "relationship_officer", "service_officer", "management"];
const PERMISSION_COLUMNS: [string, string][] = [["create", "Create"], ["approve", "Approve"], ["reject", "Reject"], ["trade", "Trade"], ["settle", "Settle"], ["adjust", "Adjust"], ["report", "Report"]];
// Client-service rights are shown in their own matrix so neither table becomes too wide to scan.
const CRM_PERMISSION_COLUMNS: [string, string][] = [["crm.thread.view", "View"], ["crm.thread.create", "Start"], ["crm.thread.reply", "Reply"], ["crm.thread.note", "Note"], ["crm.thread.assign", "Assign"], ["crm.thread.status", "Status"], ["crm.thread.priority", "Priority"]];
const ALL_PERMISSION_COLUMNS = [...PERMISSION_COLUMNS, ...CRM_PERMISSION_COLUMNS];
const grantedCount = (staffRole: Role) => ALL_PERMISSION_COLUMNS.filter(([key]) => workflowPermissions[staffRole].includes(key)).length;
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
      .catch(() => setTenant({ name: "Abyssinia Securities", license: "ESCA-BR-004", controls: { brokerageFeePct: 0.5, minimumFee: 25, approvalThreshold: 250000, clientDailyLimit: 2500000, makerChecker: true, allowedOrderTypes: ["Market", "Limit"], settlementCycle: "T+2", feeScheduleVersion: "1.0", feeScheduleEffectiveFrom: "2026-07-14", regulatoryFeeScheduleVersion: "1.0", feeRules: [{ assetClass: "equity", marketSegment: "main", brokeragePct: .5, regulatorPct: .15, exchangePct: .36, csdPct: 0, minimumFee: 25, maximumFee: null }, { assetClass: "bond", marketSegment: "main", brokeragePct: .5, regulatorPct: .005, exchangePct: .021, csdPct: 0, minimumFee: 25, maximumFee: null }] }, features: { investorPortal: true, selfDirected: true, bonds: true, recurringInvestments: true, institutionalAccounts: true, manualTradeCapture: true } }));
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
    <div className="settings-banner"><span>SHARED CONTROL</span><p>Your brokerage manages its commission schedule. ECMA, ESX, and CSD charges remain platform-managed and apply consistently to every tenant.</p></div>
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
  return <>
    <SectionHeader eyebrow="ADMINISTRATION" title="Users &amp; roles" copy="Who can access this workspace, and what each role is permitted to do." />
    <div className="settings-banner"><span>PLATFORM MANAGED</span><p>User accounts are provisioned by your Frank platform administrator. Contact them to invite a colleague, change a role, or suspend access.</p></div>
    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">ACCESS</span><h2>Team</h2></div><span className="account-number">{STAFF_ROLES.length} users</span></div>
      <div className="table-scroll"><table><thead><tr><th>User</th><th>Role</th><th className="num">Permissions</th><th>Status</th></tr></thead><tbody>
        {STAFF_ROLES.map((staffRole) => <tr key={staffRole}><td><b>{roleNames[staffRole]}</b>{staffRole === role && <small>You</small>}</td><td>{roleLabels[staffRole]}</td><td className="num">{grantedCount(staffRole)} of {ALL_PERMISSION_COLUMNS.length}</td><td><span className="status status-success"><i />Active</span></td></tr>)}
      </tbody></table></div>
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
  </>;
}
