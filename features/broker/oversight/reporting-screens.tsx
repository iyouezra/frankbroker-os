"use client";

import { useMemo } from "react";
import type { BrokerClient, DemoOrder } from "../../../lib/demo-data";
import { buildReports, downloadCsv, feesEarned, type Report } from "../../../lib/broker-reports";
import { SectionHeader, auditTime, displayLabel, etb, type AuditEntry } from "../shared/broker-foundation";

export function ReportsPage({ orders, clients, audit, onDownloaded }: { orders: DemoOrder[]; clients: BrokerClient[]; audit: AuditEntry[]; onDownloaded: (name: string) => void }) {
  const reports = useMemo(() => buildReports(orders, clients, audit), [orders, clients, audit]);
  const totalFees = useMemo(() => feesEarned(orders), [orders]);
  const download = (report: Report) => { downloadCsv(report); onDownloaded(report.name); };
  return <><SectionHeader eyebrow="CONTROL REPORTING" title="Reports" copy="Operational, client asset, fee, and audit exports generated from the current book." />
    <div className="report-grid">{reports.map((report, index) => <button className="panel report-card" key={report.id} onClick={() => download(report)} disabled={report.rows.length === 0}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{report.name}</h3><p>{report.description}</p></div><em>{report.rows.length} {report.rows.length === 1 ? "row" : "rows"} · CSV <b>↓</b></em></button>)}</div>
    <section className="panel fee-summary"><div><span className="eyebrow">EXECUTED THIS PERIOD</span><h2>Brokerage fees earned</h2><p>Sum of fees on executed orders in the current book.</p></div><strong>{etb(totalFees)}<small>{reports.find((report) => report.id === "fees")?.rows.length ?? 0} executed orders</small></strong></section></>;
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
