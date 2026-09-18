"use client";

import { useState } from "react";
import { CRM_PERMISSIONS, hasPermission, type Role } from "../../../lib/frank";
import { EmptyState, roleNames as staffNames } from "../shared/broker-foundation";
import { ThreadList } from "./thread-list";
import { ThreadDetail, type ThreadAction } from "./thread-detail";
import { emptyFilters, postThreadAction, useThreadDetail, useThreadList } from "./use-threads";

const teammates = (Object.entries(staffNames) as [Role, string][])
  .filter(([role]) => hasPermission(role, CRM_PERMISSIONS.reply))
  .map(([role, name]) => ({ id: `usr_${role}`, name }));

/**
 * Conversations for one investor, inside Client 360. Composes the very same
 * ThreadList/ThreadDetail the inbox uses - this is a scoped view of the same
 * records, never a second implementation.
 */
export function ClientConversationsTab({ clientId, role, onMessage }: { clientId: string; role: Role; onMessage: (text: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailToken, setDetailToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const { threads, loading, refresh } = useThreadList(role, { ...emptyFilters, status: "" }, clientId);
  const { thread } = useThreadDetail(role, selectedId, detailToken);

  const act = async (action: ThreadAction, payload: Record<string, unknown>, files: File[]) => {
    if (!selectedId) return false;
    setBusy(true);
    try {
      await postThreadAction(role, selectedId, action, payload, files);
      setDetailToken((token) => token + 1);
      refresh();
      onMessage(action === "note" ? "Internal note saved. The investor cannot see it." : action === "reply" ? "Reply sent to the investor." : "Conversation updated.");
      return true;
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The conversation could not be updated.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!loading && !threads.length) {
    return <section className="panel"><EmptyState title="No conversations yet" copy="Messages between this investor and your team will appear here." /></section>;
  }

  return <div className="crm-split" data-pane={selectedId ? "detail" : "list"}>
    <section className="panel crm-pane-list">
      <ThreadList
        threads={threads}
        selectedId={selectedId}
        loading={loading}
        onOpen={(summary) => {
          setSelectedId(summary.id);

        }}
      />
    </section>
    <section className="panel crm-pane-detail">
      {thread ? (
        <ThreadDetail thread={thread} role={role} busy={busy} teammates={teammates} onBack={() => setSelectedId(null)} onAction={act} />
      ) : (
        <div className="crm-detail-empty"><b>Select a conversation</b><p>Pick a conversation to read the history and reply.</p></div>
      )}
    </section>
  </div>;
}
