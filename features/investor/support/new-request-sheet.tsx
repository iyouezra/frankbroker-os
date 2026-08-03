"use client";

import { useState } from "react";
import styles from "../../../app/investor/investor.module.css";
import { Button } from "../shared/investor-foundation";
import { useT } from "../../../lib/i18n/context";
import type { TranslationKey } from "../../../lib/i18n/en";

/**
 * A short request form - category, subject, message, optional attachment.
 * Deliberately not a ticket form: no priority, no routing, no SLA language.
 */

export type NewRequestInput = { category: string; subject: string; body: string; files: File[] };

// The category value is submitted to the API, so only the label is translated.
const CHOICES: [string, TranslationKey][] = [
  ["general", "support.categoryGeneral"],
  ["order", "support.categoryOrder"],
  ["cash", "support.categoryCash"],
  ["kyc", "support.categoryKyc"],
  ["portfolio", "support.categoryPortfolio"],
  ["call_request", "support.categoryCall"],
  ["complaint", "support.categoryComplaint"],
  ["other", "support.categoryOther"],
];

export function NewRequestSheet({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (input: NewRequestInput) => Promise<boolean> }) {
  const t = useT();
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
      <h2 id="new-request-title">{t("support.newRequest")}</h2>
      <p className={styles.orderHint}>{t("support.requestIntro")}</p>

      <div className={styles.chips}>
        {CHOICES.map(([value, labelKey]) => (
          <button key={value} className={category === value ? styles.chipActive : ""} onClick={() => setCategory(value)}>{t(labelKey)}</button>
        ))}
      </div>

      <label className={styles.formField}>
        <span>{t("support.subject")}</span>
        <div><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} placeholder={t("support.subjectPlaceholder")} /></div>
      </label>
      <label className={styles.formField}>
        <span>{t("support.message")}</span>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} maxLength={4000} placeholder={t("support.messagePlaceholder")} />
      </label>
      <label className={styles.formField}>
        <span>{t("support.attachOptional")}</span>
        <div><input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))} /></div>
      </label>

      <Button className={styles.full} disabled={busy || !ready} onClick={() => void send()}>{t(busy ? "order.sending" : "support.sendRequest")}</Button>
    </section>
  </div>;
}
