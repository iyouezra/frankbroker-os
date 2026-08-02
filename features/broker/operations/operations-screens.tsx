"use client";

import { useEffect, useState } from "react";
import type { DemoOrder } from "../../../lib/demo-data";
import { COMPLIANCE_PERMISSIONS, hasPermission, type Role } from "../../../lib/frank";
import { EmptyState, Metric, SectionHeader, StatusBadge, displayLabel, etb, fmt, type ReconBatch } from "../shared/broker-foundation";

export function SettlementPage({ orders, onOpen, onExport }: { orders: DemoOrder[]; onOpen: (order: DemoOrder) => void; onExport: () => void }) {
  const queue = orders.filter((order) => ["settlement_pending", "partially_filled", "settled"].includes(order.status) || order.trades?.some((trade) => trade.settlementStatus !== "settled"));
  const settledCash = queue.filter((order) => (order.cashStatus ?? (order.status === "settled" ? "settled" : "pending")) === "settled").length;
  const settledSecurities = queue.filter((order) => (order.securitiesStatus ?? (order.status === "settled" ? "settled" : "pending")) === "settled").length;
  return <><SectionHeader eyebrow="POST-TRADE CONTROL" title="Settlement tracking" copy="Confirm cash and securities legs, value dates, and operational exceptions." action={<button className="btn secondary" onClick={onExport}>Export queue</button>} /><section className="metric-grid settlement-metrics"><Metric label="Settlement records" value={String(queue.length)} note={`${queue.filter((order) => order.status !== "settled").length} awaiting completion`} tone="warning" /><Metric label="Cash confirmed" value={`${settledCash} / ${queue.length}`} note={`${queue.length - settledCash} awaiting confirmation`} tone="success" /><Metric label="Securities confirmed" value={`${settledSecurities} / ${queue.length}`} note={`${queue.length - settledSecurities} awaiting confirmation`} tone="purple" /><Metric label="Exceptions" value={String(queue.filter((order) => order.cashStatus === "exception" || order.securitiesStatus === "exception").length)} note="From settlement records" tone="danger" /></section><section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Trade / order</th><th>Client</th><th>Instrument</th><th>Value date</th><th className="num">Net amount</th><th>Cash</th><th>Securities</th><th>Overall</th></tr></thead><tbody>{queue.map((order) => { const cash = order.cashStatus ?? (order.status === "settled" ? "settled" : "pending"); const securities = order.securitiesStatus ?? (order.status === "settled" ? "settled" : "pending"); return <tr key={order.id} onClick={() => onOpen(order)}><td><b>{order.tradeId ?? "Trade pending"}</b><small>{order.id}</small></td><td><b>{order.client}</b></td><td><b>{order.symbol}</b><small>{order.side.toUpperCase()} {fmt.format(order.tradeQuantity ?? order.quantity)}</small></td><td><b>{order.settlementDate ?? "Pending"}</b></td><td className="num"><b>{fmt.format(order.tradeNet ?? order.estimatedNet)}</b><small>ETB</small></td><td><span className={`leg ${cash === "settled" ? "done" : "pending"}`}>{displayLabel(cash)}</span></td><td><span className={`leg ${securities === "settled" ? "done" : "pending"}`}>{displayLabel(securities)}</span></td><td><StatusBadge status={order.status} /></td></tr>; })}</tbody></table></div></section></>;
}

export function ReconciliationPage({ batch, busy, role, focusId, onFile, onDownload, onResolve, onSignOff, resolvingId }: { batch: ReconBatch; busy: boolean; role: Role; focusId?: string | null; onFile: (file: File) => void; onDownload: () => void; onResolve: (id: string) => void; onSignOff: (evidenceReference: string) => void; resolvingId: string | null }) {
  const [evidenceReference, setEvidenceReference] = useState("");
  const openExceptions = batch.exceptions.filter((exception) => exception.status !== "resolved");
  const matchRate = batch.totalRecords ? (batch.matchedRecords / batch.totalRecords) * 100 : 0;
  useEffect(() => {
    if (!focusId) return;
    const reference = batch.exceptions.find((item) => item.id === focusId)?.reference ?? focusId;
    const row = Array.from(document.querySelectorAll<HTMLElement>(".exception-row")).find((item) => item.textContent?.includes(reference));
    row?.scrollIntoView({ block: "center" });
    row?.classList.add("focused-record");
    return () => row?.classList.remove("focused-record");
  }, [focusId, openExceptions.length, batch.exceptions]);
  return <>
    <SectionHeader eyebrow="END-OF-DAY CONTROL" title="Reconciliation" copy="Import external confirmations, match them to captured trades, and resolve cash or securities breaks." action={<button className="btn secondary" onClick={onDownload}>Download CSV template</button>} />
    <div className="recon-grid">
      <label className={`upload-card ${busy ? "processing" : ""}`}><input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} /><span>{busy ? "···" : "⇧"}</span><h3>{busy ? "Matching records…" : "Upload trade confirmations"}</h3><p>CSV · reference, type, actual_value · up to 1,000 rows</p><b>{busy ? "Processing safely" : "Choose CSV file"}</b></label>
      <section className="panel recon-summary"><span className="eyebrow">LATEST BATCH</span><h2>{batch.id}</h2><small>{batch.fileName ?? "Demonstration seed"}</small><div><span><small>Records</small><b>{batch.totalRecords}</b></span><span><small>Matched</small><b className="positive">{batch.matchedRecords}</b></span><span><small>Exceptions</small><b className={batch.exceptionRecords ? "negative" : "positive"}>{batch.exceptionRecords}</b></span></div><i><em style={{ width: `${matchRate}%` }} /></i><p>{matchRate.toFixed(1)}% automatically matched</p>{batch.status === "signed_off" ? <div className="recon-signoff-complete"><b>✓ Independently signed off</b><span>{batch.reviewedBy ?? "Authorized reviewer"} · {batch.evidenceReference ?? "Evidence recorded"}</span></div> : openExceptions.length === 0 && hasPermission(role, COMPLIANCE_PERMISSIONS.reconciliationSignoff) ? <div className="recon-signoff"><label>Evidence reference<input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} maxLength={160} placeholder="Bank, CSD or custody reference" /></label><button className="btn primary small" disabled={Boolean(resolvingId) || evidenceReference.trim().length < 3} onClick={() => onSignOff(evidenceReference)}>{resolvingId === "signoff" ? "Signing off…" : "Sign off"}</button><small>The importer cannot sign off their own batch.</small></div> : null}</section>
    </div>
    <section className="panel exception-panel"><div className="panel-head"><div><span className="eyebrow">OPEN EXCEPTIONS</span><h2>Items requiring resolution</h2></div><span className="exception-count">{openExceptions.length} open</span></div>{openExceptions.length ? openExceptions.map((exception) => {
      const expected = Number(exception.expectedValue ?? 0);
      const actual = Number(exception.actualValue ?? 0);
      const difference = Math.abs(expected - actual);
      return <div className="exception-row" key={exception.id}><span className={`queue-icon ${exception.exceptionType === "cash_variance" ? "danger" : "warning"}`}>!</span><div><b>{exception.exceptionType.replaceAll("_", " ")} · {exception.reference}</b><small>{exception.expectedValue === null ? "No internal trade matched this reference" : `Expected ${fmt.format(expected)} · File ${fmt.format(actual)}`}</small></div><strong>{exception.expectedValue === null ? "Unmatched" : exception.exceptionType === "cash_variance" ? `${etb(difference)}` : `${fmt.format(difference)} units`}</strong><button className="btn secondary small" disabled={resolvingId === exception.id} onClick={() => onResolve(exception.id)}>{resolvingId === exception.id ? "Resolving…" : "Resolve"}</button></div>;
    }) : <EmptyState title="Reconciliation is clear" copy="Every uploaded record matched the internal trade book." />}</section>
  </>;
}
