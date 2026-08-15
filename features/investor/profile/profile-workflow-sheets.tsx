"use client";

import { useMemo, useState, type ReactNode } from "react";
import styles from "../../../app/investor/investor.module.css";
import { BrandSelect } from "../../shared/brand-select";
import { Button, type InvestorBootstrap } from "../shared/investor-foundation";

export type ServiceRequestType = "trade_discrepancy" | "account_closure" | "profile_correction" | "tax_document" | "security_concern";
export type ServiceRequestInput = { requestType: ServiceRequestType; orderId?: string; description: string; files?: File[]; formalComplaint?: boolean };

function Sheet({ title, eyebrow, intro, onClose, children }: { title: string; eyebrow: string; intro: string; onClose: () => void; children: ReactNode }) {
  return <div className={styles.sheetBackdrop} onClick={onClose}><section className={`${styles.orderSheet} ${styles.recordsSheet}`} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
    <i className={styles.sheetHandle} />
    <div className={styles.cashSheetHead}><div><small>{eyebrow}</small><h2>{title}</h2></div><button onClick={onClose} aria-label="Close">×</button></div>
    <p className={styles.recordsIntro}>{intro}</p>{children}
  </section></div>;
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className={styles.workflowField}><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={2000} /></label>;
}

function Evidence({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  return <label className={styles.workflowUpload}><span>Supporting evidence (optional)</span><input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => onChange(Array.from(event.target.files ?? []))} /><small>{files.length ? files.map((file) => file.name).join(", ") : "Attach PDF, PNG or JPG files"}</small></label>;
}

export function StatementsTaxSheet({ onClose, onDownload, onSubmit }: { onClose: () => void; onDownload: (from: string, to: string) => Promise<boolean>; onSubmit: (input: ServiceRequestInput) => Promise<boolean> }) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = `${today.slice(0, 4)}-01-01`;
  const [from, setFrom] = useState(defaultFrom); const [to, setTo] = useState(today); const [taxYear, setTaxYear] = useState(today.slice(0, 4)); const [details, setDetails] = useState(""); const [busy, setBusy] = useState(false);
  return <Sheet title="Statements & tax" eyebrow="ACCOUNT RECORDS" intro="Download an account statement from your broker records, or ask your broker for a tax document." onClose={onClose}>
    <h3 className={styles.workflowHeading}>Account statement</h3><div className={styles.workflowDates}><label><span>From</span><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label><label><span>To</span><input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label></div>
    <Button className={styles.full} disabled={!from || !to || busy} onClick={() => { setBusy(true); void onDownload(from, to).finally(() => setBusy(false)); }}>{busy ? "Preparing statement…" : "Download statement (.xlsx)"}</Button>
    <div className={styles.workflowDivider} /><h3 className={styles.workflowHeading}>Tax document</h3>
    <label className={styles.workflowField}><span>Tax year</span><input value={taxYear} inputMode="numeric" maxLength={4} onChange={(e) => setTaxYear(e.target.value.replace(/\D/g, ""))} /></label>
    <TextArea label="What do you need?" value={details} onChange={setDetails} placeholder="For example, a transaction or withholding summary for filing." />
    <Button variant="secondary" className={styles.full} disabled={taxYear.length !== 4 || details.trim().length < 8 || busy} onClick={() => { setBusy(true); void onSubmit({ requestType: "tax_document", description: `Tax year: ${taxYear}\n\nRequested document: ${details.trim()}` }).then((ok) => { if (ok) onClose(); }).finally(() => setBusy(false)); }}>Send tax document request</Button>
  </Sheet>;
}

export function DiscrepancySheet({ orders, onClose, onSubmit }: { orders: NonNullable<InvestorBootstrap["account"]>["orders"]; onClose: () => void; onSubmit: (input: ServiceRequestInput) => Promise<boolean> }) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? ""); const [issue, setIssue] = useState("execution"); const [details, setDetails] = useState(""); const [files, setFiles] = useState<File[]>([]); const [formalComplaint, setFormalComplaint] = useState(false); const [busy, setBusy] = useState(false);
  const orderOptions = useMemo(() => orders.map((o) => ({ value: o.id, label: `${o.ticker} · ${o.side} ${o.quantity} · ${o.status}` })), [orders]);
  return <Sheet title="Report an order discrepancy" eyebrow="ORDER SUPPORT" intro="Choose the affected order and explain what does not match your instruction or expectation." onClose={onClose}>
    <label className={styles.workflowField}><span>Order</span><BrandSelect value={orderId} onChange={setOrderId} options={orderOptions} placeholder="Select an order" /></label>
    <label className={styles.workflowField}><span>Issue</span><BrandSelect value={issue} onChange={setIssue} options={[{value:"execution",label:"Execution or fill"},{value:"price",label:"Price"},{value:"quantity",label:"Quantity"},{value:"fees",label:"Fees"},{value:"other",label:"Other"}]} /></label>
    <TextArea label="Details" value={details} onChange={setDetails} placeholder="Describe what happened, what you expected, and any relevant timing." /><Evidence files={files} onChange={setFiles} />
    <label className={styles.complaintChoice}><input type="checkbox" checked={formalComplaint} onChange={(event) => setFormalComplaint(event.target.checked)} /><span><b>Treat this as a formal complaint</b><small>Select this if you are dissatisfied and want a formal investigation and written resolution.</small></span></label>
    <Button className={styles.full} disabled={!orderId || details.trim().length < 8 || busy} onClick={() => { setBusy(true); void onSubmit({ requestType: "trade_discrepancy", orderId, description: `Issue: ${issue.replaceAll("_", " ")}\n\n${details.trim()}`, files, formalComplaint }).then((ok) => { if (ok) onClose(); }).finally(() => setBusy(false)); }}>{busy ? "Sending…" : formalComplaint ? "Submit formal complaint" : "Submit discrepancy"}</Button>
  </Sheet>;
}

export function ProfileCorrectionSheet({ onClose, onSubmit }: { onClose: () => void; onSubmit: (input: ServiceRequestInput) => Promise<boolean> }) {
  const [field, setField] = useState("name"); const [currentValue, setCurrentValue] = useState(""); const [correctValue, setCorrectValue] = useState(""); const [details, setDetails] = useState(""); const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false);
  return <Sheet title="Request a profile correction" eyebrow="PROFILE RECORDS" intro="Tell your broker which record is wrong and what it should say. Evidence can be attached where needed." onClose={onClose}>
    <label className={styles.workflowField}><span>Record to correct</span><BrandSelect value={field} onChange={setField} options={[{value:"name",label:"Legal name"},{value:"email",label:"Email address"},{value:"phone",label:"Mobile number"},{value:"address",label:"Address"},{value:"tax_id",label:"Tax ID"},{value:"other",label:"Other"}]} /></label>
    <label className={styles.workflowField}><span>Current value</span><input value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} /></label><label className={styles.workflowField}><span>Correct value</span><input value={correctValue} onChange={(e) => setCorrectValue(e.target.value)} /></label>
    <TextArea label="Additional detail (optional)" value={details} onChange={setDetails} placeholder="Add context that will help the broker verify the correction." /><Evidence files={files} onChange={setFiles} />
    <Button className={styles.full} disabled={!currentValue.trim() || !correctValue.trim() || busy} onClick={() => { setBusy(true); void onSubmit({ requestType: "profile_correction", description: `Record: ${field.replaceAll("_", " ")}\nCurrent value: ${currentValue.trim()}\nCorrect value: ${correctValue.trim()}${details.trim() ? `\n\nAdditional detail: ${details.trim()}` : ""}`, files }).then((ok) => { if (ok) onClose(); }).finally(() => setBusy(false)); }}>{busy ? "Sending…" : "Submit correction request"}</Button>
  </Sheet>;
}

export function SecuritySheet({ profile, onClose, onSubmit }: { profile: InvestorBootstrap["profile"]; onClose: () => void; onSubmit: (input: ServiceRequestInput) => Promise<boolean> }) {
  const [details, setDetails] = useState(""); const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false);
  const mask = (value?: string | null) => value ? `${value.slice(0, 2)}••••${value.slice(-3)}` : "Not recorded";
  return <Sheet title="Security" eyebrow="ACCOUNT SECURITY" intro="Review the contact points used for account verification and report anything suspicious to your broker." onClose={onClose}>
    <dl className={styles.securityFacts}><div><dt>Registered mobile</dt><dd>{mask(profile?.phone)}</dd></div><div><dt>Registered email</dt><dd>{mask(profile?.email)}</dd></div><div><dt>Order authorization</dt><dd>One-time code required</dd></div></dl>
    <h3 className={styles.workflowHeading}>Report a security concern</h3><TextArea label="What happened?" value={details} onChange={setDetails} placeholder="Describe the suspicious activity, message, login or account change." /><Evidence files={files} onChange={setFiles} />
    <Button variant="danger" className={styles.full} disabled={details.trim().length < 8 || busy} onClick={() => { setBusy(true); void onSubmit({ requestType: "security_concern", description: details.trim(), files }).then((ok) => { if (ok) onClose(); }).finally(() => setBusy(false)); }}>{busy ? "Sending…" : "Report security concern"}</Button>
  </Sheet>;
}
