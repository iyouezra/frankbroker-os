"use client";

import { useEffect, useRef, useState } from "react";
import { CRM_PERMISSIONS, hasPermission, type Role } from "../../../lib/frank";
import { BROADCAST_SEGMENTS, type AudiencePreview, type BroadcastInput, type BroadcastOptions, type BroadcastRecipient, type BroadcastSummary } from "../../../lib/crm/broadcasts";
import { BROKER_TENANT_ID, auditTime } from "../shared/broker-foundation";
import { BrandSelect } from "../../shared/brand-select";

const headers = (role: Role) => ({ "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role, "content-type": "application/json" });
async function result<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { if (!response.ok) throw new Error(text || "Request failed."); throw new Error("Unexpected response."); }
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data as T;
}
const initial: BroadcastInput = { subject: "", body: "", segment: "all", channel: "in_app", instrumentId: "", corporateActionId: "", eventName: "" };

export function BroadcastPanel({ role, onNotify, onOpenThread }: { role: Role; onNotify: (message: string, tone?: "success" | "error") => void; onOpenThread: (id: string) => void }) {
  const [broadcasts, setBroadcasts] = useState<BroadcastSummary[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [compose, setCompose] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [recipientPages, setRecipientPages] = useState(1);
  const [recipientError, setRecipientError] = useState("");
  const [recipientLoading, setRecipientLoading] = useState(false);
  const composeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const data = await result<{ broadcasts: BroadcastSummary[]; pageCount: number }>(await fetch(`/api/crm/broadcasts?page=${page}`, { headers: headers(role), signal: controller.signal }));
        if (controller.signal.aborted) return;
        setBroadcasts(data.broadcasts); setPageCount(data.pageCount); setError("");
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Broadcasts unavailable."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [role, page, refresh]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const load = async () => {
      setRecipientLoading(true);
      try {
        const data = await result<{ recipients: BroadcastRecipient[]; pageCount: number }>(await fetch(`/api/crm/broadcasts?id=${encodeURIComponent(selected)}&page=${recipientPage}`, { headers: headers(role), signal: controller.signal }));
        if (!controller.signal.aborted) { setRecipients(data.recipients); setRecipientPages(data.pageCount); setRecipientError(""); }
      } catch (error) { if (!controller.signal.aborted) setRecipientError(error instanceof Error ? error.message : "Recipients unavailable."); }
      finally { if (!controller.signal.aborted) setRecipientLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [role, selected, recipientPage, refresh]);

  const selectedBroadcast = broadcasts.find((item) => item.id === selected);
  return <section className="panel crm-broadcast-panel">
    <div className="panel-head"><div><h2>Broadcasts</h2><p>One message, private delivery to each client. Replies return to Conversations.</p></div><div className="crm-broadcast-actions"><button className="btn secondary small" onClick={() => setRefresh((value) => value + 1)}>Refresh</button>{hasPermission(role, CRM_PERMISSIONS.broadcastSend) && <button ref={composeButton} className="btn primary" onClick={() => setCompose(true)}>+ New broadcast</button>}</div></div>
    <p className="crm-broadcast-explainer">✓✓ Delivered to the client’s in-app inbox · <span className="crm-receipt read">✓✓ Read</span> when they open the conversation.</p>
    {error ? <div className="crm-broadcast-empty" role="alert"><b>Could not load broadcasts</b><p>{error}</p></div> : loading ? <div className="crm-broadcast-empty">Loading broadcasts…</div> : !broadcasts.length ? <div className="crm-broadcast-empty"><b>Keep clients informed, without starting a group chat.</b><p>Share issuer updates, event notices or account information with everyone or a specific audience.</p></div> : <div className="table-scroll"><table className="crm-broadcast-table"><thead><tr><th>Message</th><th>Audience</th><th>Recipients</th><th>Delivered</th><th>Read</th><th /></tr></thead><tbody>{broadcasts.map((item) => <tr key={item.id} className={selected === item.id ? "selected" : ""}>
      <td><b>{item.subject}</b><small>{item.contextLabel || "General update"}</small><small>{auditTime(item.sentAt)} · In-app</small></td><td>{BROADCAST_SEGMENTS[item.segment as keyof typeof BROADCAST_SEGMENTS] ?? item.segment}</td><td>{item.recipientCount}</td><td><span className="crm-receipt">✓✓ {item.delivered}</span></td><td><span className="crm-receipt read">✓✓ {item.read}</span><small>{item.recipientCount ? Math.round(item.read / item.recipientCount * 100) : 0}% opened</small></td><td><button className="btn secondary small" aria-expanded={selected === item.id} onClick={() => { setSelected(selected === item.id ? null : item.id); setRecipients([]); setRecipientError(""); setRecipientPage(1); }}>Details</button></td>
    </tr>)}</tbody></table></div>}
    {pageCount > 1 && <div className="crm-broadcast-pagination"><button className="btn secondary small" disabled={page <= 1} onClick={() => { setPage(page - 1); setSelected(null); }}>Previous</button><span>Page {page} of {pageCount}</span><button className="btn secondary small" disabled={page >= pageCount} onClick={() => { setPage(page + 1); setSelected(null); }}>Next</button></div>}
    {selectedBroadcast && <div className="crm-broadcast-detail"><div className="panel-head"><h3>{selectedBroadcast.subject}</h3><button className="btn secondary small" onClick={() => setSelected(null)}>Close details</button></div><p className="crm-broadcast-body">{selectedBroadcast.body}</p><h4>Individual delivery</h4>
      {recipientError ? <p role="alert">{recipientError}</p> : recipientLoading ? <p>Loading recipients…</p> : <div className="table-scroll"><table><thead><tr><th>Client</th><th>Delivered to inbox</th><th>Read / opened</th><th /></tr></thead><tbody>{recipients.map((item) => <tr key={item.clientId}><td><b>{item.name}</b><small>{item.code}</small></td><td>{item.deliveredAt ? auditTime(item.deliveredAt) : "Not confirmed"}</td><td>{item.readAt ? <span className="crm-receipt read">✓✓ {auditTime(item.readAt)}</span> : "Not yet read"}</td><td><button className="btn secondary small" onClick={() => onOpenThread(item.threadId)}>Conversation →</button></td></tr>)}</tbody></table></div>}
      {recipientPages > 1 && <div className="crm-broadcast-pagination"><button className="btn secondary small" disabled={recipientPage <= 1} onClick={() => setRecipientPage(recipientPage - 1)}>Previous</button><span>Page {recipientPage} of {recipientPages}</span><button className="btn secondary small" disabled={recipientPage >= recipientPages} onClick={() => setRecipientPage(recipientPage + 1)}>Next</button></div>}
    </div>}
    {compose && <BroadcastComposer role={role} onClose={() => { setCompose(false); composeButton.current?.focus(); }} onSent={(count) => { setCompose(false); setPage(1); setRefresh((value) => value + 1); onNotify(`Broadcast delivered to ${count} client inbox${count === 1 ? "" : "es"}.`); composeButton.current?.focus(); }} />}
  </section>;
}

function BroadcastComposer({ role, onClose, onSent }: { role: Role; onClose: () => void; onSent: (count: number) => void }) {
  const [value, setValue] = useState<BroadcastInput>(initial);
  const [options, setOptions] = useState<BroadcastOptions | null>(null);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/crm/broadcasts?options=1", { headers: headers(role), signal: controller.signal }).then(result<BroadcastOptions>).then(setOptions).catch((error) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Options unavailable."); });
    return () => controller.abort();
  }, [role]);
  const update = (patch: Partial<BroadcastInput>) => { setValue((current) => ({ ...current, ...patch })); setPreview(null); setError(""); requestKey.current = crypto.randomUUID(); };
  const review = async () => {
    setBusy(true); setError("");
    try { setPreview(await result<AudiencePreview>(await fetch("/api/crm/broadcasts", { method: "POST", headers: headers(role), body: JSON.stringify({ ...value, action: "preview" }) }))); }
    catch (error) { setError(error instanceof Error ? error.message : "Preview unavailable."); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!preview) return;
    let confirmationUnknown = true;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/crm/broadcasts", { method: "POST", headers: headers(role), body: JSON.stringify({ ...value, action: "send", requestKey: requestKey.current, audienceToken: preview.token }) });
      confirmationUnknown = response.status >= 500;
      if (response.status === 409) { setPreview(null); setUncertain(false); }
      const data = await result<{ recipientCount: number }>(response);
      onSent(data.recipientCount);
    } catch (error) { setError(error instanceof Error ? error.message : "Send could not be confirmed. Retry safely with the same send reference."); setUncertain(confirmationUnknown); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="crm-broadcast-dialog" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} aria-labelledby="broadcast-title">
    <div className="drawer-content"><div className="drawer-title"><span className="eyebrow">CLIENT COMMUNICATION</span><h2 id="broadcast-title">{preview ? "Review broadcast" : "New broadcast"}</h2><p>{preview ? "Each client receives a private message. They cannot see the recipient list." : "Choose who needs this update, then review before sending."}</p></div>
      <button type="button" className="drawer-close" disabled={busy} aria-label="Close broadcast" onClick={onClose}>×</button>
      {preview ? <div className="crm-broadcast-review"><div className="crm-audience-count"><strong>{preview.count}</strong><span>client{preview.count === 1 ? "" : "s"} · In-app</span></div><p>{BROADCAST_SEGMENTS[value.segment]} · Excludes closed and rejected clients</p>{preview.contextLabel && <p>{preview.contextLabel}</p>}<h3>{value.subject}</h3><p className="crm-broadcast-body">{value.body}</p><details><summary>Recipient sample ({preview.sample.length} of {preview.count})</summary><ul>{preview.sample.map((client) => <li key={client.id}>{client.fullName} · {client.clientCode}</li>)}</ul></details></div> : <fieldset className="form-section" disabled={busy}>
        <label>Audience<BrandSelect value={value.segment} onChange={(segment) => update({ segment: segment as BroadcastInput["segment"] })} ariaLabel="Broadcast audience" options={Object.entries(BROADCAST_SEGMENTS).map(([value, label]) => ({ value, label }))} /></label>
        <small>Includes current client records; closed and rejected clients are excluded.</small>
        <div className="field-row"><label>Company / security{value.segment === "holders" ? "" : " (optional)"}<BrandSelect value={value.instrumentId} disabled={!options || Boolean(value.corporateActionId)} onChange={(instrumentId) => update({ instrumentId })} ariaLabel="Company or security" options={[{ value: "", label: "No company link" }, ...(options?.instruments.map((item) => ({ value: item.id, label: item.label })) ?? [])]} /></label><label>Channel<BrandSelect value="in_app" onChange={() => undefined} ariaLabel="Broadcast channel" options={[{ value: "in_app", label: "In-app" }, { value: "sms", label: "SMS · not connected", disabled: true }, { value: "email", label: "Email · not connected", disabled: true }]} /></label></div>
        <label>Corporate-action event{value.segment === "event_entitlements" ? "" : " (optional)"}<BrandSelect value={value.corporateActionId} disabled={!options} onChange={(corporateActionId) => update({ corporateActionId, instrumentId: options?.events.find((event) => event.id === corporateActionId)?.instrumentId ?? value.instrumentId, eventName: "" })} ariaLabel="Linked event" options={[{ value: "", label: "No existing event" }, ...(options?.events.filter((event) => !value.instrumentId || event.instrumentId === value.instrumentId).map((event) => ({ value: event.id, label: event.label })) ?? [])]} /></label>
        {value.segment === "holders" && <small>Uses current holdings, including blocked holdings. For record-date eligibility, choose “Clients entitled to an event”.</small>}
        {value.segment === "event_entitlements" && <small>Uses recorded positive entitlements for the selected event, not today’s holdings.</small>}
        {!value.corporateActionId && <label>Other event name (optional)<input value={value.eventName} onChange={(event) => update({ eventName: event.target.value })} maxLength={160} placeholder="e.g. Annual general meeting · 25 September" /></label>}
        <label>Subject<input value={value.subject} onChange={(event) => update({ subject: event.target.value })} maxLength={160} placeholder="A clear title for the update" /></label>
        <label>Message<textarea value={value.body} onChange={(event) => update({ body: event.target.value })} rows={6} maxLength={4000} placeholder="Write the update each client will receive…" /></label>
        <p className="crm-broadcast-channel-note">In-app delivery and read receipts are available. SMS and email need a messaging provider connection.</p>
      </fieldset>}
      {error && <p className="crm-broadcast-error" role="alert">{error}{uncertain && preview && " Retry uses the same reference and will not send a second copy."}</p>}
      <div className="drawer-footer">{preview ? <><button className="btn secondary" disabled={busy || uncertain} onClick={() => setPreview(null)}>Edit message</button><button className="btn primary" disabled={busy || !preview.count} onClick={() => void send()}>{busy ? "Sending…" : uncertain ? "Retry send safely" : `Send to ${preview.count} client${preview.count === 1 ? "" : "s"}`}</button></> : <button className="btn primary" disabled={busy || !options || value.subject.trim().length < 4 || value.body.trim().length < 2} onClick={() => void review()}>{busy ? "Checking audience…" : "Review recipients →"}</button>}</div>
    </div>
  </dialog>;
}
