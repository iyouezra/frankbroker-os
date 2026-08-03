"use client";

import styles from "../../../app/investor/investor.module.css";
import { Button, Card, ScreenHeader } from "../shared/investor-foundation";
import { useT } from "../../../lib/i18n/context";

/**
 * Investor-facing conversation list. Deliberately plain: no priority, no
 * assignment, no internal vocabulary - just what the investor asked and whether
 * anyone is waiting on them.
 */

export type SupportThreadSummary = {
  id: string;
  subject: string;
  category: string;
  status: string;
  statusLabel: string;
  relatedType: string | null;
  relatedId: string | null;
  messageCount: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unread: number;
  createdAt: string;
};

const when = (value: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }).format(new Date(value));

export function statusTone(status: string): string {
  if (status === "resolved") return styles.msgStatusDone;
  if (status === "pending_client") return styles.msgStatusYou;
  return styles.msgStatusWaiting;
}

export function SupportScreen({
  threads, loading, officer, onBack, onOpenThread, onNewRequest,
}: {
  threads: SupportThreadSummary[];
  officer?: { name: string; role: string } | null;
  loading: boolean;
  onBack: () => void;
  onOpenThread: (threadId: string) => void;
  onNewRequest: () => void;
}) {
  const t = useT();
  return <div className={styles.screen}>
    <ScreenHeader title={t("support.title")} onBack={onBack} />
    <Card className={styles.supportIntro}>
      <b>{t("support.needHand")}</b>
      <p>{t("support.intro")}</p>
      {officer && <span className={styles.supportOfficer}>{t("support.officerPrefix")}<b>{officer.name}</b>{t("support.officerSuffix", { role: officer.role })}</span>}
      <Button className={styles.full} onClick={onNewRequest}>{t("support.newRequest")}</Button>
    </Card>

    {loading ? (
      <p className={styles.empty}>{t("support.loading")}</p>
    ) : threads.length === 0 ? (
      <Card><p className={styles.empty}>{t("support.noConversations")}</p></Card>
    ) : (
      <Card className={styles.msgList}>
        {threads.map((thread) => (
          <button key={thread.id} className={styles.msgRow} onClick={() => onOpenThread(thread.id)}>
            <span className={styles.msgRowTop}>
              <b>{thread.subject}</b>
              {thread.unread > 0 && <em className={styles.msgUnread}>{thread.unread}</em>}
            </span>
            {thread.lastMessagePreview && <span className={styles.msgPreview}>{thread.lastMessagePreview}</span>}
            <span className={styles.msgRowMeta}>
              <span className={`${styles.msgStatus} ${statusTone(thread.status)}`}>{thread.statusLabel}</span>
              <time>{when(thread.lastMessageAt)}</time>
            </span>
          </button>
        ))}
      </Card>
    )}
  </div>;
}
