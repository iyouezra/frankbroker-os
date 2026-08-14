"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role } from "../../../lib/frank";
import { EmptyState, SectionHeader, displayLabel } from "../shared/broker-foundation";

type Instrument = { id: string; symbol: string; name: string };
type SelfData = {
  profile: { id: string; linkedAccount?: { accountNumber: string } | null; annualAttestationDueAt: string | null } | null;
  instruments: Instrument[];
  dealingRegister: Array<{
    id: string; side: string; quantity: string; price: string; status: string; submittedAt: string | null;
    instrument: { symbol: string; name: string };
    trades: Array<{ id: string; tradeDate: string; quantityFilled: string; executionPrice: string }>;
    personalTradeClearance?: { id: string; status: string } | null;
    controlStatus: string;
  }>;
  clearances: Array<{ id: string; side: string; businessDate: string; maxQuantity: string | null; maxValue: string | null; status: string; instrument: { symbol: string; name: string } }>;
  disclosures: Array<{ id: string; disclosureType: string; title: string; status: string; createdAt: string; details: Record<string, unknown> }>;
  attestations: Array<{ id: string; attestationYear: number; status: string; attestedAt: string | null }>;
};

const emptyData: SelfData = { profile: null, instruments: [], dealingRegister: [], clearances: [], disclosures: [], attestations: [] };

function status(value: string) {
  const tone = ["approved", "attested", "filled", "settled"].includes(value) ? "success" : ["pending", "submitted", "high", "critical"].includes(value) ? "warning" : "neutral";
  return <span className={`status status-${tone}`}><i />{displayLabel(value)}</span>;
}

export function EmployeeComplianceSelfService({ role, tenantId, onNotify }: { role: Role; tenantId: string; onNotify: (message: string, tone?: "success" | "error") => void }) {
  const [data, setData] = useState<SelfData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [clearance, setClearance] = useState({ instrumentId: "", side: "buy", maxQuantity: "", maxValue: "" });
  const [dealing, setDealing] = useState({ securityName: "", symbol: "", side: "buy", tradeDate: "", quantity: "", value: "", executingBroker: "", notes: "" });
  const headers = useMemo(() => ({ "x-frank-tenant-id": tenantId, "x-frank-demo-role": role }), [role, tenantId]);
  const year = new Date().getFullYear();
  const attested = data.attestations.some((item) => item.attestationYear === year && item.status === "attested");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/compliance/employee-conduct/me", { headers });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your compliance records are unavailable.");
      setData(result);
    } catch (error) { onNotify(error instanceof Error ? error.message : "Your compliance records are unavailable.", "error"); }
    finally { setLoading(false); }
  }, [headers, onNotify]);

  useEffect(() => { const timeout = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timeout); }, [load]);

  const post = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/compliance/employee-conduct/me", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The compliance record could not be saved.");
      onNotify(message);
      await load();
      return true;
    } catch (error) { onNotify(error instanceof Error ? error.message : "The compliance record could not be saved.", "error"); return false; }
    finally { setBusy(false); }
  };

  if (loading) return <section className="panel"><div className="panel-body"><p>Loading your compliance records…</p></div></section>;
  if (!data.profile) return <><SectionHeader eyebrow="MY COMPLIANCE" title="Personal dealing and conduct" copy="Your records are visible only to you and authorized Compliance staff." /><section className="panel"><EmptyState title="Employee profile not enrolled" copy="Compliance must complete the one-time Fayda enrollment before personal-trade clearance, automatic in-house monitoring, declarations and attestations are available." /></section></>;

  return <>
    <SectionHeader eyebrow="MY COMPLIANCE" title="Personal dealing and conduct" copy={`Automatic in-house register${data.profile.linkedAccount ? ` · ${data.profile.linkedAccount.accountNumber}` : ""}, external dealing declarations and annual attestation.`} />
    <div className="perf-grid">
      <section className="panel cash-capture"><div className="panel-head"><div><span className="eyebrow">PRE-CLEARANCE</span><h2>Request personal-trade clearance</h2></div></div><div className="cash-capture-grid">
        <label>Instrument<select value={clearance.instrumentId} onChange={(event) => setClearance((current) => ({ ...current, instrumentId: event.target.value }))}><option value="">Select instrument</option>{data.instruments.map((item) => <option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}</select></label>
        <label>Side<select value={clearance.side} onChange={(event) => setClearance((current) => ({ ...current, side: event.target.value }))}><option value="buy">Buy</option><option value="sell">Sell</option></select></label>
        <label>Maximum quantity<input type="number" min="0" value={clearance.maxQuantity} onChange={(event) => setClearance((current) => ({ ...current, maxQuantity: event.target.value }))} /></label>
        <label>Maximum value (ETB)<input type="number" min="0" value={clearance.maxValue} onChange={(event) => setClearance((current) => ({ ...current, maxValue: event.target.value }))} /></label>
      </div><div className="drawer-actions"><button className="btn primary" disabled={busy || !clearance.instrumentId || (!clearance.maxQuantity && !clearance.maxValue)} onClick={() => void post({ action: "request_clearance", ...clearance }, "Personal-trade clearance requested.").then((ok) => { if (ok) setClearance({ instrumentId: "", side: "buy", maxQuantity: "", maxValue: "" }); })}>Request clearance</button></div></section>
      <section className="panel cash-capture"><div className="panel-head"><div><span className="eyebrow">ANNUAL CONTROL</span><h2>{year} conduct attestation</h2></div>{status(attested ? "attested" : "pending")}</div><div className="panel-body"><p>I confirm that the in-house activity shown in this workspace and my submitted external-dealing declarations are complete, and that any exceptions have been disclosed.</p></div><div className="drawer-actions"><button className="btn primary" disabled={busy || attested} onClick={() => void post({ action: "attest", year, statementVersion: "employee-conduct-1.0" }, `${year} conduct attestation recorded.`)}>{attested ? "Attested" : "Record attestation"}</button></div></section>
    </div>

    <section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">AUTOMATIC REGISTER</span><h2>In-house personal dealing</h2></div><p>No manual declaration is needed for these orders.</p></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Security</th><th>Order</th><th>Execution</th><th>Clearance</th><th>Control</th></tr></thead><tbody>{data.dealingRegister.map((item) => <tr key={item.id}><td>{item.submittedAt ? new Date(item.submittedAt).toLocaleString() : "—"}</td><td><b>{item.instrument.symbol}</b><small>{item.instrument.name}</small></td><td>{displayLabel(item.side)} · {Number(item.quantity).toLocaleString()} @ {Number(item.price).toLocaleString()}<small>{item.id} · {displayLabel(item.status)}</small></td><td>{item.trades.length ? item.trades.map((trade) => <small key={trade.id}>{Number(trade.quantityFilled).toLocaleString()} @ {Number(trade.executionPrice).toLocaleString()} · {new Date(trade.tradeDate).toLocaleDateString()}</small>) : "Not executed"}</td><td>{item.personalTradeClearance ? status(item.personalTradeClearance.status) : "Not linked"}</td><td>{status(item.controlStatus)}</td></tr>)}</tbody></table></div>{!data.dealingRegister.length && <EmptyState title="No in-house personal dealing" copy="Orders on your linked in-house account will appear here automatically." />}</section>

    <section className="panel cash-capture"><div className="panel-head"><div><span className="eyebrow">EXTERNAL ACTIVITY</span><h2>Declare personal dealing outside this broker</h2></div><p>Only activity the system cannot observe needs manual entry.</p></div><div className="cash-capture-grid">
      <label>Security name<input value={dealing.securityName} onChange={(event) => setDealing((current) => ({ ...current, securityName: event.target.value }))} /></label><label>Symbol / identifier<input value={dealing.symbol} onChange={(event) => setDealing((current) => ({ ...current, symbol: event.target.value }))} /></label><label>Side<select value={dealing.side} onChange={(event) => setDealing((current) => ({ ...current, side: event.target.value }))}><option value="buy">Buy</option><option value="sell">Sell</option></select></label><label>Trade date<input type="date" value={dealing.tradeDate} onChange={(event) => setDealing((current) => ({ ...current, tradeDate: event.target.value }))} /></label><label>Quantity<input type="number" min="0" value={dealing.quantity} onChange={(event) => setDealing((current) => ({ ...current, quantity: event.target.value }))} /></label><label>Value<input type="number" min="0" value={dealing.value} onChange={(event) => setDealing((current) => ({ ...current, value: event.target.value }))} /></label><label>Executing broker<input value={dealing.executingBroker} onChange={(event) => setDealing((current) => ({ ...current, executingBroker: event.target.value }))} /></label><label>Notes<input value={dealing.notes} onChange={(event) => setDealing((current) => ({ ...current, notes: event.target.value }))} /></label>
    </div><div className="drawer-actions"><button className="btn primary" disabled={busy || !dealing.securityName.trim() || !dealing.tradeDate || !dealing.executingBroker.trim()} onClick={() => void post({ action: "disclose_personal_dealing", title: `${dealing.side === "sell" ? "Sale" : "Purchase"} of ${dealing.securityName}`, details: { ...dealing, executionVenue: "external" } }, "External personal dealing declared.").then((ok) => { if (ok) setDealing({ securityName: "", symbol: "", side: "buy", tradeDate: "", quantity: "", value: "", executingBroker: "", notes: "" }); })}>Submit declaration</button></div></section>

    <div className="perf-grid"><section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">CLEARANCES</span><h2>My requests</h2></div></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Security</th><th>Limit</th><th>Status</th></tr></thead><tbody>{data.clearances.map((item) => <tr key={item.id}><td>{new Date(item.businessDate).toLocaleDateString()}</td><td><b>{item.instrument.symbol}</b><small>{displayLabel(item.side)}</small></td><td>{item.maxQuantity ? `${Number(item.maxQuantity).toLocaleString()} units` : item.maxValue ? `${Number(item.maxValue).toLocaleString()} ETB` : "—"}</td><td>{status(item.status)}</td></tr>)}</tbody></table></div></section><section className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">DECLARATIONS</span><h2>External dealing submitted</h2></div></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Declaration</th><th>Status</th></tr></thead><tbody>{data.disclosures.filter((item) => item.disclosureType === "personal_dealing").map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleDateString()}</td><td><b>{item.title}</b><small>{String(item.details.executingBroker ?? "External broker")}</small></td><td>{status(item.status)}</td></tr>)}</tbody></table></div></section></div>
  </>;
}
