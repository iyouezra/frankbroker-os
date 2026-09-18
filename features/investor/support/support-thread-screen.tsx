"use client";

import { useState, type FormEvent } from "react";
import styles from "../../../app/investor/investor.module.css";
import { useT } from "../../../lib/i18n/context";
import { Button, Card, ScreenHeader } from "../shared/investor-foundation";
import { statusTone } from "./support-screen";

/**
 * One conversation, investor view. The payload it renders has already had
 * broker-only messages stripped server-side; this screen has no concept of
 * internal notes, owners, or priority.
 */

export type SupportMessage = {
  deliveredAt?: string | null;
  readAt?: string | null;
  deliveryStatus?: "sent" | "delivered" | "read";
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  authorLabel: string;
  attachments: { id: string; name: string; mimeType: string; sizeBytes: number }[];
};

export type SupportThreadDetail = {
  broadcastLabel?: string | null;
  id: string;
  subject: string;
  status: string;
  statusLabel: string;
  relatedType: string | null;
  relatedId: string | null;
  messages: SupportMessage[];
};

const when = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }).format(new Date(value));

export function SupportThreadScreen({
  thread, sending, onBack, onSend,
}: {
  thread: SupportThreadDetail | null;
  sending: boolean;
  onBack: () => void;
  onSend: (body: string, files: File[]) => Promise<boolean>;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  if (!thread) {
    return <div className={styles.screen}><ScreenHeader title={t("support.conversation")} onBack={onBack} /><p className={styles.empty}>{t("support.loadingShort")}</p></div>;
  }

  const closed = thread.status === "closed";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    const sent = await onSend(draft, files);
    if (sent) { setDraft(""); setFiles([]); }
  };

  return <div className={styles.screen}>
    <ScreenHeader title={t("support.conversation")} onBack={onBack} />
    <Card className={styles.msgHeadCard}>
      <b>{thread.subject}</b>
      {thread.broadcastLabel && <small>{thread.broadcastLabel}</small>}
      <span className={`${styles.msgStatus} ${statusTone(thread.status)}`}>{thread.statusLabel}</span>
      {thread.relatedId && <small>{t("support.about", { reference: thread.relatedId })}</small>}
    </Card>

    <div className={styles.msgThread}>
      {thread.messages.map((message) => (
        <article key={message.id} className={`${styles.msgBubble} ${message.mine ? styles.msgMine : ""}`}>
          <header><b>{message.authorLabel}</b><time>{when(message.createdAt)}</time></header>
          <p>{message.body}</p>
          {message.mine && message.deliveryStatus && <small className={message.readAt ? styles.msgReceiptRead : styles.msgReceipt} aria-label={t(message.readAt ? "support.read" : message.deliveredAt ? "support.delivered" : "support.sent")}><span aria-hidden="true">{message.deliveredAt || message.readAt ? "✓✓" : "✓"}</span> {t(message.readAt ? "support.read" : message.deliveredAt ? "support.delivered" : "support.sent")}</small>}
          {message.attachments.map((attachment) => (
            <a key={attachment.id} className={styles.attachmentChip} href={`/api/investor/support/attachments/${encodeURIComponent(attachment.id)}`} target="_blank" rel="noreferrer">
              {attachment.name}
            </a>
          ))}
        </article>
      ))}
    </div>

    {closed ? (
      <Card><p className={styles.empty}>{t("support.closed")}</p></Card>
    ) : (
      <form className={styles.msgComposer} onSubmit={(event) => void submit(event)}>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder={t("support.replyPlaceholder")} aria-label={t("support.replyLabel")} />
        <div className={styles.msgComposerFoot}>
          <input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))} aria-label={t("support.attachLabel")} />
          <Button type="submit" disabled={sending || !draft.trim()}>{t(sending ? "order.sending" : "support.send")}</Button>
        </div>
      </form>
    )}
  </div>;
}
