"use client";

import { useState } from "react";
import styles from "../../../app/investor/investor.module.css";
import { Button } from "../shared/investor-foundation";

/**
 * A short request form - category, subject, message, optional attachment.
 * Deliberately not a ticket form: no priority, no routing, no SLA language.
 */

export type NewRequestInput = { category: string; subject: string; body: string; files: File[] };

const CHOICES: [string, string][] = [
  ["general", "General account help"],
  ["order", "About an order"],
  ["cash", "Deposit or withdrawal"],
  ["kyc", "Documents and verification"],
  ["portfolio", "My portfolio"],
  ["call_request", "Ask for a call"],
  ["complaint", "Make a complaint"],
  ["other", "Something else"],
];

export function NewRequestSheet({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (input: NewRequestInput) => Promise<boolean> }) {
  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const ready = subject.trim().length >= 4 && body.trim().length >= 2;

  const send = async () => {
    const sent = await onSubmit({ category, subject, body, files });
    if (sent) { setSubject(""); setBody(""); setFiles([]); setCategory("general"); }
  };

  return <div className={styles.sheetBackdrop} onClick={onClose}>
    <section className={styles.orderSheet} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-request-title">
      <i className={styles.sheetHandle} />
      <h2 id="new-request-title">New request</h2>
      <p className={styles.orderHint}>Tell us what you need and we&apos;ll reply here.</p>

      <div className={styles.chips}>
        {CHOICES.map(([value, label]) => (
          <button key={value} className={category === value ? styles.chipActive : ""} onClick={() => setCategory(value)}>{label}</button>
        ))}
      </div>

      <label className={styles.formField}>
        <span>Subject</span>
        <div><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} placeholder="A short summary" /></div>
      </label>
      <label className={styles.formField}>
        <span>Message</span>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} maxLength={4000} placeholder="What can we help with?" />
      </label>
      <label className={styles.formField}>
        <span>Attach a document (optional)</span>
        <div><input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))} /></div>
      </label>

      <Button className={styles.full} disabled={busy || !ready} onClick={() => void send()}>{busy ? "Sending…" : "Send request"}</Button>
    </section>
  </div>;
}
