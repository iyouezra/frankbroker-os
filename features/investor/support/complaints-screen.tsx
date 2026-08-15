"use client";

import { useState } from "react";
import styles from "../../../app/investor/investor.module.css";
import { Button, Card, Icon, ScreenHeader } from "../shared/investor-foundation";

export type InvestorComplaint = {
  id: string; subject: string; status: string; statusLabel: string; severity: string;
  openedAt: string; targetResolutionAt: string | null; resolutionSummary: string | null;
  resolvedAt: string | null; closedAt: string | null; threadId: string | null; orderId: string | null;
};

const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Addis_Ababa" }).format(new Date(value)) : "—";

export function ComplaintsScreen({ complaints, loading, selectedId, busy, onBack, onSelect, onConversation, onAction }: {
  complaints: InvestorComplaint[]; loading: boolean; selectedId: string | null; busy: boolean;
  onBack: () => void; onSelect: (id: string | null) => void; onConversation: (threadId: string) => void;
  onAction: (caseId: string, action: "accept_resolution" | "remain_dissatisfied", reason?: string) => Promise<boolean>;
}) {
  const complaint = complaints.find((item) => item.id === selectedId) ?? null;
  const [dissatisfied, setDissatisfied] = useState(false);
  const [reason, setReason] = useState("");
  if (complaint) return <div className={styles.screen}>
    <ScreenHeader title="Complaint" onBack={() => { setDissatisfied(false); setReason(""); onSelect(null); }} />
    <Card className={styles.complaintDetail}>
      <div className={styles.complaintTitle}><span><small>{complaint.id}</small><b>{complaint.subject}</b></span><em data-status={complaint.status}>{complaint.statusLabel}</em></div>
      <dl><div><dt>Received</dt><dd>{date(complaint.openedAt)}</dd></div><div><dt>Target resolution</dt><dd>{date(complaint.targetResolutionAt)}</dd></div>{complaint.orderId && <div><dt>Affected order</dt><dd>{complaint.orderId}</dd></div>}</dl>
      {complaint.resolutionSummary && <section className={styles.complaintResolution}><small>WRITTEN RESOLUTION</small><p>{complaint.resolutionSummary}</p><time>Published {date(complaint.resolvedAt)}</time></section>}
      {complaint.threadId && <button className={styles.complaintConversation} onClick={() => onConversation(complaint.threadId!)}><span><b>Conversation and evidence</b><small>View updates or provide requested information</small></span><Icon name="chevron" size={17} /></button>}
      {complaint.status === "resolved" && !dissatisfied && <div className={styles.complaintDecision}><p>Tell your broker whether this resolves your complaint.</p><Button className={styles.full} disabled={busy} onClick={() => void onAction(complaint.id, "accept_resolution")}>I accept this resolution</Button><Button variant="secondary" className={styles.full} disabled={busy} onClick={() => setDissatisfied(true)}>I remain dissatisfied</Button></div>}
      {complaint.status === "resolved" && dissatisfied && <div className={styles.complaintDecision}><label>Why are you dissatisfied?<textarea rows={5} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={4000} placeholder="Explain what remains unresolved or what outcome you are seeking." /></label><Button variant="danger" className={styles.full} disabled={busy || reason.trim().length < 10} onClick={() => void onAction(complaint.id, "remain_dissatisfied", reason).then((ok) => { if (ok) setDissatisfied(false); })}>Request further review</Button><button className={styles.complaintCancel} onClick={() => setDissatisfied(false)}>Cancel</button></div>}
      {complaint.status === "closed" && <p className={styles.complaintClosed}>You accepted the resolution and this complaint is closed. The complete record remains available here.</p>}
    </Card>
  </div>;
  return <div className={styles.screen}>
    <ScreenHeader title="Complaints" onBack={onBack} />
    <Card className={styles.supportIntro}><b>Formal complaints</b><p>Track investigations, information requests and written outcomes. Ordinary questions remain under conversations.</p></Card>
    {loading ? <p className={styles.empty}>Loading complaints…</p> : complaints.length === 0 ? <Card><p className={styles.empty}>You have not raised a formal complaint.</p></Card> : <Card className={styles.complaintList}>{complaints.map((item) => <button key={item.id} onClick={() => { setDissatisfied(false); setReason(""); onSelect(item.id); }}><span><small>{item.id} · {date(item.openedAt)}</small><b>{item.subject}</b>{item.orderId && <small>Order {item.orderId}</small>}</span><em data-status={item.status}>{item.statusLabel}</em><Icon name="chevron" size={16} /></button>)}</Card>}
  </div>;
}
