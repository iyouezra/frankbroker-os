"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  adminAudit,
  formatAdminEtb,
  initialAdminInstruments,
  initialAdminUsers,
  initialIntegrations,
  initialTenants,
  type AdminInstrument,
  type AdminAuditEvent,
  type AdminUser,
  type FeatureKey,
  type TenantConfig,
  type TenantIntegration,
} from "../../lib/admin-data";
import styles from "./admin.module.css";
import { demoPlatformNotifications, timeAgo, type NotificationItem } from "../../lib/notifications-demo";

type View = "overview" | "tenants" | "instruments" | "users" | "controls" | "integrations" | "audit";
type ConfigTab = "identity" | "features" | "branding" | "legal";

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Platform overview", icon: "dashboard" },
  { id: "tenants", label: "Tenants", icon: "building" },
  { id: "instruments", label: "Instrument master", icon: "list" },
  { id: "users", label: "Users & roles", icon: "users" },
  { id: "controls", label: "Controls & fees", icon: "sliders" },
  { id: "integrations", label: "Integrations", icon: "plug" },
  { id: "audit", label: "Platform audit", icon: "history" },
];

// Lucide-style line icons (24×24, stroke 1.8) - matches the Frank design system.
const ICON_PATHS: Record<string, string> = {
  dashboard: "M4 13h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1z M14 21h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1z M14 9h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1z M4 21h6a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1z",
  building: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2 M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2 M10 6h4 M10 10h4 M10 14h4 M10 18h4",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  sliders: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M2 14h4 M10 8h4 M18 16h4",
  plug: "M12 22v-5 M9 8V2 M15 8V2 M18 8v3a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z",
  history: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2",
  collapse: "M9 3v18 M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
  bell: "M10.268 21a2 2 0 0 0 3.464 0 M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
};

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const d = ICON_PATHS[name] ?? "";
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d.split(" M").map((segment, index) => <path key={index} d={(index ? "M" : "") + segment.trim()} />)}</svg>;
}

const featureLabels: Record<FeatureKey, { title: string; description: string }> = {
  investorPortal: { title: "Investor portal", description: "Give investors access to portfolio, markets, orders, and statements." },
  selfDirected: { title: "Self-directed investing", description: "Allow investors to select ESX stocks and bonds themselves." },
  bonds: { title: "Government bonds", description: "Show and trade Government of Ethiopia treasury bonds." },
  recurringInvestments: { title: "Recurring investments", description: "Allow investors to schedule regular deposits and purchases." },
  institutionalAccounts: { title: "Institutional accounts", description: "Support organizations, representatives, and institutional KYC." },
  manualTradeCapture: { title: "Manual trade capture", description: "Allow brokers to record executions received outside an integration." },
};

function Button({ children, variant = "primary", onClick, disabled = false, type = "button" }: { children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return <button type={type} className={`${styles.button} ${styles[variant]}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${styles.card} ${className}`}>{children}</section>;
}

function Status({ value }: { value: string }) {
  const tone = value.toLowerCase().replaceAll(" ", "-");
  return <span className={`${styles.status} ${styles[tone] ?? ""}`}><i />{value}</span>;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`${styles.switch} ${checked ? styles.switchOn : ""}`} onClick={() => onChange(!checked)}><i /></button>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className={styles.pageHeader}><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className={styles.headerActions}>{actions}</div>}</header>;
}

function Metric({ label, value, detail, tone = "teal" }: { label: string; value: string; detail: string; tone?: "teal" | "green" | "amber" | "blue" }) {
  return <Card className={`${styles.metric} ${styles[`metric-${tone}`]}`}><span>{label}<i /></span><strong>{value}</strong><small>{detail}</small></Card>;
}

function Overview({ tenants, activity, onTenant, onConfigure }: { tenants: TenantConfig[]; activity: AdminAuditEvent[]; onTenant: (id: string) => void; onConfigure: () => void }) {
  const active = tenants.filter((tenant) => tenant.status === "active").length;
  const clients = tenants.reduce((sum, tenant) => sum + tenant.clients, 0);
  const assets = tenants.reduce((sum, tenant) => sum + tenant.assetsUnderAdministration, 0);
  const orders = tenants.reduce((sum, tenant) => sum + tenant.ordersToday, 0);
  return <><PageHeader eyebrow="PLATFORM CONTROL" title="Everything running on FrankBroker" description="See every tenant, surface issues early, and move into configuration without leaving the control plane." actions={<Button onClick={onConfigure}>Configure a tenant</Button>} /><div className={styles.demoBanner}><b>DEMO MODE</b><span>Configuration persists to the shared database when DATABASE_URL is connected. Synthetic fallbacks keep this preview usable offline.</span></div><div className={styles.metricGrid}><Metric label="Active tenants" value={`${active}`} detail={`${tenants.length} total organizations`} /><Metric label="Investor accounts" value={clients.toLocaleString()} detail="Across all tenants" tone="blue" /><Metric label="Assets administered" value={formatAdminEtb(assets)} detail="Synthetic demo balances" tone="green" /><Metric label="Orders today" value={orders.toLocaleString()} detail="Across broker portals" tone="amber" /></div><div className={styles.overviewGrid}><Card className={styles.tenantHealth}><div className={styles.cardHead}><div><span>TENANT HEALTH</span><h2>Organizations</h2></div><button onClick={onConfigure}>Manage tenants</button></div><div className={styles.tenantTable}><div className={styles.tableHead}><span>Tenant</span><span>Status</span><span>Users</span><span>Clients</span><span>Orders</span><span /></div>{tenants.map((tenant) => <button key={tenant.id} onClick={() => { onTenant(tenant.id); onConfigure(); }}><span className={styles.tenantIdentity}><i style={{ background: tenant.primaryColor }}>{tenant.initials}</i><span><b>{tenant.tradingName}</b><small>{tenant.licenseNumber}</small></span></span><Status value={tenant.status} /><span>{tenant.users}</span><span>{tenant.clients}</span><span>{tenant.ordersToday}</span><em>→</em></button>)}</div></Card><Card className={styles.recentActivity}><div className={styles.cardHead}><div><span>PLATFORM ACTIVITY</span><h2>Latest changes</h2></div></div>{activity.slice(0, 4).map((event) => <div className={styles.activityRow} key={event.id}><i /><span><b>{event.action}</b><small>{event.detail}</small></span><time>{event.time}</time></div>)}</Card></div></>;
}

function Field({ label, value, onChange, hint, type = "text" }: { label: string; value: string | number; onChange: (value: string) => void; hint?: string; type?: "text" | "number" | "email" }) {
  return <label className={styles.field}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} />{hint && <small>{hint}</small>}</label>;
}

function TenantSettings({ tenant, tenants, tab, setTab, onSelect, onUpdate, onSave, onPublishLegal }: { tenant: TenantConfig; tenants: TenantConfig[]; tab: ConfigTab; setTab: (tab: ConfigTab) => void; onSelect: (id: string) => void; onUpdate: (tenant: TenantConfig) => void; onSave: () => void; onPublishLegal?: () => void }) {
  const set = <K extends keyof TenantConfig>(key: K, value: TenantConfig[K]) => onUpdate({ ...tenant, [key]: value });
  const updateLegal = (patch: Partial<TenantConfig["legalDocument"]>) => set("legalDocument", { ...tenant.legalDocument, ...patch });
  const publishLegal = onPublishLegal ?? (() => {
    void fetch("/api/admin/configuration", {
      method: "POST",
      headers: { "content-type": "application/json", "x-frank-demo-role": "super_admin" },
      body: JSON.stringify({ entity: "legal_document", data: { ...tenant.legalDocument, brokerId: tenant.id } }),
    });
  });
  return <>
    <PageHeader eyebrow="TENANT CONFIGURATION" title={tenant.tradingName} description="Control what this tenant sees, how it looks, and which FrankBroker capabilities are available." actions={<><select className={styles.tenantSelect} value={tenant.id} onChange={(event) => onSelect(event.target.value)}>{tenants.map((item) => <option key={item.id} value={item.id}>{item.tradingName}</option>)}</select><Button onClick={onSave}>Save configuration</Button></>} />
    <div className={styles.tenantSummary}><span className={styles.tenantAvatar} style={{ background: tenant.primaryColor }}>{tenant.initials}</span><div><b>{tenant.name}</b><small>{tenant.licenseNumber} · {tenant.plan} plan</small></div><Status value={tenant.status} /><span><small>Portal domain</small><b>{tenant.domain}</b></span><span><small>Business date</small><b>{tenant.businessDate}</b></span></div>
    <div className={styles.configTabs}>{([["identity", "Identity & access"], ["features", "Features"], ["branding", "Branding"], ["legal", "Legal & consent"]] as const).map(([id, label]) => <button key={id} className={tab === id ? styles.configTabActive : ""} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === "identity" && <div className={styles.settingsGrid}><Card><div className={styles.sectionTitle}><span>TENANT IDENTITY</span><h2>Organization details</h2><p>These details identify the licensed broker across the platform.</p></div><div className={styles.formGrid}><Field label="Legal organization name" value={tenant.name} onChange={(value) => set("name", value)} /><Field label="Trading name" value={tenant.tradingName} onChange={(value) => set("tradingName", value)} /><Field label="License number" value={tenant.licenseNumber} onChange={(value) => set("licenseNumber", value)} /><label className={styles.field}><span>Status</span><select value={tenant.status} onChange={(event) => set("status", event.target.value as TenantConfig["status"])}><option value="active">Active</option><option value="pilot">Pilot</option><option value="suspended">Suspended</option></select><small>Suspending a tenant blocks new activity.</small></label></div></Card><Card><div className={styles.sectionTitle}><span>DEFAULTS</span><h2>Operating context</h2><p>Shared defaults used by broker and investor experiences.</p></div><div className={styles.formGrid}><Field label="Business date" value={tenant.businessDate} onChange={(value) => set("businessDate", value)} /><Field label="Support email" type="email" value={tenant.supportEmail} onChange={(value) => set("supportEmail", value)} /><label className={styles.field}><span>Base currency</span><select value={tenant.baseCurrency} disabled><option>ETB</option></select></label><label className={styles.field}><span>Timezone</span><select value={tenant.timezone} disabled><option>Africa/Addis_Ababa</option></select></label></div></Card></div>}
    {tab === "features" && <Card className={styles.featureCard}><div className={styles.sectionTitle}><span>CAPABILITY FLAGS</span><h2>Choose what this tenant can use</h2><p>Changes apply to the tenant’s broker and investor experiences.</p></div><div className={styles.featureGrid}>{(Object.keys(featureLabels) as FeatureKey[]).map((key) => <div className={styles.featureRow} key={key}><span><b>{featureLabels[key].title}</b><small>{featureLabels[key].description}</small></span><Switch label={featureLabels[key].title} checked={tenant.features[key]} onChange={(checked) => set("features", { ...tenant.features, [key]: checked })} /></div>)}</div></Card>}
    {tab === "branding" && <div className={styles.brandingGrid}><Card><div className={styles.sectionTitle}><span>INVESTOR BRAND</span><h2>Tenant presentation</h2><p>Keep the Frank interaction system while adapting the tenant-facing identity.</p></div><Field label="Investor portal domain" value={tenant.domain} onChange={(value) => set("domain", value)} /><Field label="Support email" type="email" value={tenant.supportEmail} onChange={(value) => set("supportEmail", value)} /><label className={styles.field}><span>Welcome message</span><textarea value={tenant.welcomeMessage} onChange={(event) => set("welcomeMessage", event.target.value)} /></label><div className={styles.colorField}><span>Primary accent</span><div>{["#0C8189", "#2277C8", "#0E9F5B", "#DE8F14", "#5C58A8"].map((color) => <button key={color} aria-label={`Use ${color}`} className={tenant.primaryColor === color ? styles.colorSelected : ""} style={{ background: color }} onClick={() => set("primaryColor", color)} />)}<input aria-label="Custom brand color" type="color" value={tenant.primaryColor} onChange={(event) => set("primaryColor", event.target.value)} /></div></div></Card><BrandPreview tenant={tenant} /></div>}
    {tab === "legal" && <div className={styles.settingsGrid}><Card><div className={styles.sectionTitle}><span>VERSIONED TERMS</span><h2>Brokerage account agreement</h2><p>Publish tenant-specific terms and retain the exact version each investor accepted.</p></div><div className={styles.formGrid}><Field label="Document title" value={tenant.legalDocument.title} onChange={(value) => updateLegal({ title: value })} /><Field label="Version" value={tenant.legalDocument.version} onChange={(value) => updateLegal({ version: value })} /><Field label="Effective date" value={tenant.legalDocument.effectiveAt} onChange={(value) => updateLegal({ effectiveAt: value })} /><label className={styles.field}><span>Language</span><select value={tenant.legalDocument.language} onChange={(event) => updateLegal({ language: event.target.value })}><option value="en">English</option><option value="am">Amharic</option></select></label></div><label className={styles.field}><span>Plain-language summary</span><textarea value={tenant.legalDocument.summary} onChange={(event) => updateLegal({ summary: event.target.value })} /></label><label className={styles.field}><span>Full legal text</span><textarea className={styles.legalText} value={tenant.legalDocument.content} onChange={(event) => updateLegal({ content: event.target.value })} /></label><div className={styles.controlToggle}><span><b>Require re-acceptance</b><small>Existing investors must accept this version before placing another order.</small></span><Switch label="Require re-acceptance" checked={tenant.legalDocument.requiresReacceptance} onChange={(checked) => updateLegal({ requiresReacceptance: checked })} /></div><Button onClick={publishLegal}>Publish version {tenant.legalDocument.version}</Button></Card><Card><div className={styles.sectionTitle}><span>CONSENT POLICY</span><h2>Investor evidence controls</h2><p>These settings apply across KYC, order submission, and service requests.</p></div><div className={styles.controlToggle}><span><b>Terms required before trading</b><small>Orders are rejected until the current document version is accepted.</small></span><Switch label="Terms required before trading" checked={tenant.controls.requireTermsAcceptance} onChange={(checked) => set("controls", { ...tenant.controls, requireTermsAcceptance: checked })} /></div><div className={styles.formGrid}><Field label="KYC review interval (months)" type="number" value={tenant.controls.kycReviewMonths} onChange={(value) => set("controls", { ...tenant.controls, kycReviewMonths: Number(value) })} /><Field label="Discrepancy window (days)" type="number" value={tenant.controls.discrepancyWindowDays} onChange={(value) => set("controls", { ...tenant.controls, discrepancyWindowDays: Number(value) })} /></div><div className={styles.feePreview}><span><small>Published status</small><b>{tenant.legalDocument.status}</b></span><span><small>Current version</small><b>{tenant.legalDocument.version}</b></span><span><small>Effective</small><b>{tenant.legalDocument.effectiveAt}</b></span></div></Card></div>}
  </>;
}

function BrandPreview({ tenant }: { tenant: TenantConfig }) {
  return <Card className={styles.brandPreview}><div className={styles.previewLabel}><span>LIVE PREVIEW</span><small>Investor welcome surface</small></div><div className={styles.previewWindow}><header><span style={{ background: tenant.primaryColor }}>{tenant.initials}</span><b>{tenant.tradingName}</b></header><main style={{ background: `linear-gradient(155deg, ${tenant.primaryColor}, #083E47)` }}><small>YOUR MONEY, ALL TOGETHER</small><h2>{tenant.welcomeMessage}</h2><button style={{ color: tenant.primaryColor }}>Start investing</button></main><footer><span>Powered by</span><Image src="/frankscore-icon.png" width={24} height={24} alt="" /><b>Frank</b></footer></div></Card>;
}

function Instruments({ tenant, instruments, onToggleTenant, onToggleStatus }: { tenant: TenantConfig; instruments: AdminInstrument[]; onToggleTenant: (instrument: AdminInstrument) => void; onToggleStatus: (instrument: AdminInstrument) => void }) {
  const [filter, setFilter] = useState("");
  const rows = instruments.filter((instrument) => `${instrument.symbol} ${instrument.name}`.toLowerCase().includes(filter.toLowerCase()));
  return <><PageHeader eyebrow="PLATFORM REFERENCE DATA" title="Instrument master" description={`Manage the shared ESX catalogue and choose which instruments ${tenant.tradingName} can offer.`} /><div className={styles.toolbar}><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search symbol or issuer…" /><span><i />Tenant context: <b>{tenant.tradingName}</b></span></div><Card className={styles.dataCard}><div className={`${styles.dataRow} ${styles.dataHeader}`}><span>Instrument</span><span>Asset class</span><span>Status</span><span>Lot</span><span>Tick</span><span>Cycle</span><span>Tenant access</span></div>{rows.map((instrument) => <div className={styles.dataRow} key={instrument.id}><span className={styles.instrumentName}><b>{instrument.symbol}</b><small>{instrument.name}</small></span><span>{instrument.assetClass}</span><button className={styles.statusButton} onClick={() => onToggleStatus(instrument)}><Status value={instrument.status} /></button><span className={styles.mono}>{instrument.lotSize}</span><span className={styles.mono}>{instrument.tickSize}</span><span className={styles.mono}>{instrument.settlementCycle}</span><span><Switch label={`${instrument.symbol} tenant access`} checked={instrument.enabledTenantIds.includes(tenant.id)} onChange={() => onToggleTenant(instrument)} /></span></div>)}</Card></>;
}

function Users({ tenant, users, onInvite, onToggle }: { tenant: TenantConfig; users: AdminUser[]; onInvite: () => void; onToggle: (user: AdminUser) => void }) {
  const rows = users.filter((user) => user.tenantId === tenant.id);
  return <><PageHeader eyebrow="ACCESS CONTROL" title="Users and roles" description={`Manage who can access ${tenant.tradingName} and what each person is allowed to do.`} actions={<Button onClick={onInvite}>Invite user</Button>} /><div className={styles.metricGridSmall}><Metric label="Tenant users" value={`${rows.length}`} detail={`${rows.filter((user) => user.status === "Active").length} active`} /><Metric label="MFA coverage" value={`${rows.length ? Math.round(rows.filter((user) => user.mfa).length / rows.length * 100) : 0}%`} detail="Multi-factor authentication" tone="green" /><Metric label="Pending invitations" value={`${rows.filter((user) => user.status === "Invited").length}`} detail="Awaiting activation" tone="amber" /></div><Card className={styles.dataCard}><div className={`${styles.userRow} ${styles.dataHeader}`}><span>User</span><span>Role</span><span>Status</span><span>MFA</span><span>Last active</span><span /></div>{rows.map((user) => <div className={styles.userRow} key={user.id}><span className={styles.userIdentity}><i>{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</i><span><b>{user.name}</b><small>{user.email}</small></span></span><span><select value={user.role} disabled><option>{user.role}</option></select></span><Status value={user.status} /><span>{user.mfa ? "Required" : "Not enabled"}</span><span>{user.lastActive}</span><button onClick={() => onToggle(user)}>{user.status === "Suspended" ? "Restore" : "Suspend"}</button></div>)}{rows.length === 0 && <div className={styles.emptyState}><b>No users yet</b><span>Invite the first administrator for this tenant.</span></div>}</Card></>;
}

function Controls({ tenant, onUpdate, onSave, onPublishFees }: { tenant: TenantConfig; onUpdate: (tenant: TenantConfig) => void; onSave: () => void; onPublishFees?: () => void }) {
  const controls = tenant.controls;
  const update = (patch: Partial<TenantConfig["controls"]>) => onUpdate({ ...tenant, controls: { ...controls, ...patch } });
  const updateSchedule = (patch: Partial<TenantConfig["feeSchedule"]>) => onUpdate({ ...tenant, feeSchedule: { ...tenant.feeSchedule, ...patch } });
  const updateRule = (index: number, field: keyof TenantConfig["feeSchedule"]["rules"][number], value: string) => updateSchedule({ rules: tenant.feeSchedule.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [field]: field === "marketSegment" ? value : value === "" && field === "maximumFee" ? null : Number(value) } : rule) });
  const publishFees = onPublishFees ?? (() => {
    void fetch("/api/admin/configuration", {
      method: "POST",
      headers: { "content-type": "application/json", "x-frank-demo-role": "super_admin" },
      body: JSON.stringify({ entity: "fee_schedule", data: { ...tenant.feeSchedule, brokerId: tenant.id } }),
    });
  });
  const toggleOrderType = (type: "Market" | "Limit" | "Stop-loss") => update({ allowedOrderTypes: controls.allowedOrderTypes.includes(type) ? controls.allowedOrderTypes.filter((item) => item !== type) : [...controls.allowedOrderTypes, type] });
  const sampleRule = tenant.feeSchedule.rules[0];
  const sampleFee = sampleRule ? Math.max(sampleRule.minimumFee, 10_000 * sampleRule.brokeragePct / 100) + 10_000 * (sampleRule.regulatorPct + sampleRule.exchangePct + sampleRule.csdPct) / 100 : 0;
  return <><PageHeader eyebrow="TENANT POLICY" title="Controls and fees" description={`Set risk gates, approval behavior, trading limits, and the fee schedule for ${tenant.tradingName}.`} actions={<Button onClick={onSave}>Save policy</Button>} /><div className={styles.controlsGrid}><Card><div className={styles.sectionTitle}><span>WORKFLOW</span><h2>Approval and limits</h2><p>These controls are evaluated before an order can move forward.</p></div><div className={styles.controlToggle}><span><b>Maker-checker approval</b><small>Require a second authorized person to approve orders.</small></span><Switch label="Maker-checker approval" checked={controls.makerChecker} onChange={(checked) => update({ makerChecker: checked })} /></div><div className={styles.formGrid}><Field label="Approval threshold (ETB)" type="number" value={controls.approvalThreshold} onChange={(value) => update({ approvalThreshold: Number(value) })} hint="Orders at or above this value require approval." /><Field label="Client daily limit (ETB)" type="number" value={controls.clientDailyLimit} onChange={(value) => update({ clientDailyLimit: Number(value) })} hint="Maximum daily gross order value per client." /><label className={styles.field}><span>Settlement cycle</span><select value={controls.settlementCycle} onChange={(event) => update({ settlementCycle: event.target.value as TenantConfig["controls"]["settlementCycle"] })}><option>T+1</option><option>T+2</option><option>T+3</option></select></label></div><div className={styles.orderTypes}><span>Allowed order types</span>{(["Market", "Limit", "Stop-loss"] as const).map((type) => <label key={type}><input type="checkbox" checked={controls.allowedOrderTypes.includes(type)} onChange={() => toggleOrderType(type)} /><i />{type}</label>)}</div></Card><Card className={styles.feeScheduleCard}><div className={styles.sectionTitle}><span>VERSIONED FEE SCHEDULE</span><h2>Transaction charges</h2><p>Configure each disclosed charge separately. Do not hardcode regulator, exchange, or CSD rates without a verified source.</p></div><div className={styles.formGrid}><Field label="Schedule name" value={tenant.feeSchedule.name} onChange={(value) => updateSchedule({ name: value })} /><Field label="Version" value={tenant.feeSchedule.version} onChange={(value) => updateSchedule({ version: value })} /><Field label="Effective from" value={tenant.feeSchedule.effectiveFrom} onChange={(value) => updateSchedule({ effectiveFrom: value })} /></div><div className={styles.feeRuleTable}><div><b>Asset</b><b>Broker %</b><b>ECMA %</b><b>ESX %</b><b>CSD %</b><b>Minimum</b></div>{tenant.feeSchedule.rules.map((rule, index) => <div key={`${rule.assetClass}-${rule.marketSegment}`}><strong>{rule.assetClass === "bond" ? "Government bond" : "Equity"}</strong><input aria-label={`${rule.assetClass} broker percent`} type="number" step="0.01" value={rule.brokeragePct} onChange={(event) => updateRule(index, "brokeragePct", event.target.value)} /><input aria-label={`${rule.assetClass} regulator percent`} type="number" step="0.01" value={rule.regulatorPct} onChange={(event) => updateRule(index, "regulatorPct", event.target.value)} /><input aria-label={`${rule.assetClass} exchange percent`} type="number" step="0.01" value={rule.exchangePct} onChange={(event) => updateRule(index, "exchangePct", event.target.value)} /><input aria-label={`${rule.assetClass} CSD percent`} type="number" step="0.01" value={rule.csdPct} onChange={(event) => updateRule(index, "csdPct", event.target.value)} /><input aria-label={`${rule.assetClass} minimum fee`} type="number" value={rule.minimumFee} onChange={(event) => updateRule(index, "minimumFee", event.target.value)} /></div>)}</div><div className={styles.feePreview}><span><small>Example order</small><b>ETB 10,000</b></span><span><small>Total disclosed fees</small><b>{formatAdminEtb(sampleFee)}</b></span><span><small>Schedule version</small><b>{tenant.feeSchedule.version}</b></span></div><Button onClick={publishFees}>Publish fee schedule</Button></Card></div></>;
}

function Integrations({ tenant, integrations, onChange }: { tenant: TenantConfig; integrations: TenantIntegration[]; onChange: (integration: TenantIntegration) => void }) {
  const rows = integrations.filter((integration) => integration.tenantId === tenant.id);
  return <><PageHeader eyebrow="TENANT CONNECTIONS" title="Integrations" description={`Control data exchange modes for ${tenant.tradingName}. Manual mode stays available while external connections are prepared.`} /><div className={styles.integrationGrid}>{rows.map((integration) => <Card className={styles.integrationCard} key={integration.id}><div className={styles.integrationHead}><span>{integration.name.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><Status value={integration.status} /></div><h2>{integration.name}</h2><p>{integration.description}</p><label><span>Operating mode</span><select value={integration.mode} onChange={(event) => { const mode = event.target.value as TenantIntegration["mode"]; onChange({ ...integration, mode, status: mode === "Live" ? "Connected" : mode === "Sandbox" ? "Sandbox" : "Not connected" }); }}><option>Manual</option><option>Sandbox</option><option>Live</option></select></label></Card>)}</div></>;
}

function Audit({ tenantId, events }: { tenantId: string; events: AdminAuditEvent[] }) {
  const [scope, setScope] = useState<"tenant" | "all">("all");
  const rows = events.filter((event) => scope === "all" || event.tenantId === tenantId);
  const exportAudit = () => {
    const csv = ["time,tenant,actor,action,detail", ...rows.map((event) => [event.time, event.tenantId, event.actor, event.action, event.detail].map((value) => `"${value.replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `frankbroker-platform-audit-${scope}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return <><PageHeader eyebrow="CONTROL EVIDENCE" title="Platform audit" description="Trace configuration, access, and platform-level changes across tenants." actions={<Button variant="secondary" onClick={exportAudit}>Export audit</Button>} /><div className={styles.toolbar}><div className={styles.scopeButtons}><button className={scope === "all" ? styles.scopeActive : ""} onClick={() => setScope("all")}>All tenants</button><button className={scope === "tenant" ? styles.scopeActive : ""} onClick={() => setScope("tenant")}>Current tenant</button></div></div><Card className={styles.auditList}>{rows.map((event) => <div key={event.id}><i /><time>{event.time}</time><span><small>{event.actor}</small><b>{event.action}</b><p>{event.detail}</p></span><em>{event.tenantId}</em></div>)}</Card></>;
}

function InviteDialog({ tenant, onClose, onInvite }: { tenant: TenantConfig; onClose: () => void; onInvite: (user: AdminUser) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminUser["role"]>("Trader");
  return <div className={styles.dialogBackdrop} onClick={onClose}><form className={styles.dialog} onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); onInvite({ id: `usr_${Date.now()}`, tenantId: tenant.id, name, email, role, status: "Invited", mfa: false, lastActive: "Not yet" }); }}><span>NEW TENANT USER</span><h2>Invite to {tenant.tradingName}</h2><p>The user will receive an invitation and must enable MFA before operational access.</p><Field label="Full name" value={name} onChange={setName} /><Field label="Work email" type="email" value={email} onChange={setEmail} /><label className={styles.field}><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value as AdminUser["role"])}>{["Broker admin", "Trader", "Compliance", "Settlement", "Read only"].map((item) => <option key={item}>{item}</option>)}</select></label><div><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={name.trim().length < 3 || !email.includes("@")}>Send invitation</Button></div></form></div>;
}

export default function AdminConsole() {
  const [view, setView] = useState<View>("overview");
  const [tenants, setTenants] = useState(initialTenants);
  const [tenantId, setTenantId] = useState(initialTenants[0].id);
  const [configTab, setConfigTab] = useState<ConfigTab>("identity");
  const [instruments, setInstruments] = useState(initialAdminInstruments);
  const [users, setUsers] = useState(initialAdminUsers);
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [auditEvents, setAuditEvents] = useState(adminAudit);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  // Read the pre-hydration theme after mount so SSR and the client agree.
  useEffect(() => {
    const syncTheme = () => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    syncTheme();
  }, []);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [toast, setToast] = useState("");
  const tenant = tenants.find((item) => item.id === tenantId) ?? tenants[0];
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("frank-theme", next); } catch { /* storage unavailable */ }
  };
  const platformHeaders = { "x-frank-demo-role": "super_admin" };
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/notifications", { headers: platformHeaders, signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("offline")))
      .then((data: { notifications: NotificationItem[] }) => setNotifications(data.notifications))
      .catch(() => setNotifications(demoPlatformNotifications()));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const unreadNotifs = notifications.filter((item) => !item.read).length;
  const markAllNotifsRead = () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    void fetch("/api/notifications", { method: "PATCH", headers: { ...platformHeaders, "content-type": "application/json" }, body: JSON.stringify({ all: true }) }).catch(() => undefined);
  };
  const openNotification = (item: NotificationItem) => {
    setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, read: true } : row));
    void fetch("/api/notifications", { method: "PATCH", headers: { ...platformHeaders, "content-type": "application/json" }, body: JSON.stringify({ id: item.id }) }).catch(() => undefined);
    setBellOpen(false);
    if (item.entityType === "tenant" && item.entityId && tenants.some((tenant) => tenant.id === item.entityId)) {
      setTenantId(item.entityId);
      setView("tenants");
    }
  };
  const updateTenant = (next: TenantConfig) => setTenants((current) => current.map((item) => item.id === next.id ? next : item));
  const request = async (method: "POST" | "PATCH", body: unknown) => {
    const response = await fetch("/api/admin/configuration", {
      method,
      headers: { "content-type": "application/json", "x-frank-demo-role": "super_admin" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Unable to persist change");
    return response.json();
  };
  const persist = (method: "POST" | "PATCH", body: unknown, message: string) => {
    void request(method, body).then(() => notify(message)).catch(() => notify("Saved in the offline demo; connect DATABASE_URL to persist it."));
  };
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/configuration", { headers: { "x-frank-demo-role": "super_admin" }, signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { tenants: TenantConfig[]; instruments: AdminInstrument[]; users: AdminUser[]; integrations: TenantIntegration[]; audit: AdminAuditEvent[] }) => {
        if (data.tenants.length) { setTenants(data.tenants); setTenantId((current) => data.tenants.some((item) => item.id === current) ? current : data.tenants[0].id); }
        setInstruments(data.instruments); setUsers(data.users); setIntegrations(data.integrations); setAuditEvents(data.audit);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const save = () => persist("PATCH", { entity: "tenant", id: tenant.id, data: tenant }, `${tenant.tradingName} configuration saved to the shared platform.`);
  const toggleTenantInstrument = (instrument: AdminInstrument) => {
    const enabled = !instrument.enabledTenantIds.includes(tenant.id);
    setInstruments((current) => current.map((item) => item.id === instrument.id ? { ...item, enabledTenantIds: enabled ? [...item.enabledTenantIds, tenant.id] : item.enabledTenantIds.filter((id) => id !== tenant.id) } : item));
    persist("PATCH", { entity: "instrument", id: instrument.id, tenantId: tenant.id, data: { enabled } }, `${instrument.symbol} access updated for ${tenant.tradingName}.`);
  };
  const toggleInstrumentStatus = (instrument: AdminInstrument) => {
    const status = instrument.status === "Tradable" ? "Halted" : "Tradable";
    setInstruments((current) => current.map((item) => item.id === instrument.id ? { ...item, status } : item));
    persist("PATCH", { entity: "instrument", id: instrument.id, data: { status } }, `${instrument.symbol} is now ${status.toLowerCase()}.`);
  };
  const toggleUser = (user: AdminUser) => {
    const status = user.status === "Suspended" ? "Active" : "Suspended";
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, status } : item));
    persist("PATCH", { entity: "user", id: user.id, data: { status } }, `${user.name} access updated.`);
  };
  const changeIntegration = (integration: TenantIntegration) => {
    setIntegrations((current) => current.map((item) => item.id === integration.id ? integration : item));
    persist("PATCH", { entity: "integration", id: integration.id, data: { mode: integration.mode, status: integration.status } }, `${integration.name} mode saved.`);
  };
  const inviteUser = (user: AdminUser) => {
    setUsers((current) => [...current, user]); setInviteOpen(false);
    persist("POST", { entity: "user", data: user }, `Invitation recorded for ${user.email}.`);
  };
  const enabledFeatures = useMemo(() => Object.values(tenant.features).filter(Boolean).length, [tenant.features]);

  return <main className={styles.adminShell}><aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}><div className={styles.brand}><span><Image src="/frankscore-icon.png" width={32} height={32} alt="" /></span><div><b>FrankBroker</b><small>PLATFORM ADMIN</small></div><button className={styles.sidebarToggle} onClick={() => setCollapsed((current) => !current)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand" : "Collapse"}><Icon name="collapse" size={18} /></button></div><nav aria-label="Admin navigation">{navItems.map((item) => <button key={item.id} className={view === item.id ? styles.navActive : ""} onClick={() => setView(item.id)} title={item.label}><i><Icon name={item.icon} size={19} /></i><span>{item.label}</span>{item.id === "tenants" && <em>{tenants.length}</em>}</button>)}</nav><div className={styles.sidebarFoot}><span><i /><b>Shared platform</b></span><small>Database-backed when connected</small></div></aside><section className={styles.workspace}><header className={styles.topbar}><div className={styles.mobileBrand}><Image src="/frankscore-icon.png" width={27} height={27} alt="" /><b>FrankBroker Admin</b></div><label className={styles.contextSelect}><small>TENANT CONTEXT</small><select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>{tenants.map((item) => <option key={item.id} value={item.id}>{item.tradingName}</option>)}</select></label><span className={styles.contextMeta}><Status value={tenant.status} /><b>{enabledFeatures}/8 features</b></span><button className={styles.themeToggle} onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}><Icon name={theme === "dark" ? "sun" : "moon"} size={18} /></button><div className={styles.notifWrap}><button className={styles.themeToggle} aria-label="Notifications" onClick={() => setBellOpen((value) => !value)}><Icon name="bell" size={18} />{unreadNotifs > 0 && <em>{unreadNotifs > 9 ? "9+" : unreadNotifs}</em>}</button>{bellOpen && <><div className={styles.notifScrim} onClick={() => setBellOpen(false)} /><div className={styles.notifPanel} role="dialog" aria-label="Notifications"><div className={styles.notifHead}><b>Platform activity</b>{unreadNotifs > 0 && <button onClick={markAllNotifsRead}>Mark all read</button>}</div><div className={styles.notifList}>{notifications.length === 0 ? <div className={styles.notifEmpty}>Nothing new right now.</div> : notifications.map((item) => <button key={item.id} className={`${styles.notifItem} ${item.read ? "" : styles.notifUnread}`} onClick={() => openNotification(item)}><i className={styles.notifDot} data-sev={item.severity} /><div><b>{item.title}</b><p>{item.body}</p><small>{timeAgo(item.createdAt)}</small></div></button>)}</div></div></>}</div><div className={styles.adminUser}><span>FY</span><div><b>Fikru Yilma</b><small>Platform administrator</small></div></div></header><div className={styles.content}>{view === "overview" ? <Overview tenants={tenants} activity={auditEvents} onTenant={setTenantId} onConfigure={() => setView("tenants")} /> : view === "tenants" ? <TenantSettings tenant={tenant} tenants={tenants} tab={configTab} setTab={setConfigTab} onSelect={setTenantId} onUpdate={updateTenant} onSave={save} /> : view === "instruments" ? <Instruments tenant={tenant} instruments={instruments} onToggleTenant={toggleTenantInstrument} onToggleStatus={toggleInstrumentStatus} /> : view === "users" ? <Users tenant={tenant} users={users} onInvite={() => setInviteOpen(true)} onToggle={toggleUser} /> : view === "controls" ? <Controls tenant={tenant} onUpdate={updateTenant} onSave={save} /> : view === "integrations" ? <Integrations tenant={tenant} integrations={integrations} onChange={changeIntegration} /> : <Audit tenantId={tenant.id} events={auditEvents} />}</div></section>{inviteOpen && <InviteDialog tenant={tenant} onClose={() => setInviteOpen(false)} onInvite={inviteUser} />}{toast && <div className={styles.toast} role="status"><i>✓</i><span><b>Change recorded</b><small>{toast}</small></span></div>}</main>;
}
