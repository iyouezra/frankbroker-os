"use client";

import { useState } from "react";
import type { BrokerClient } from "../../../lib/demo-data";
import { CRM_PERMISSIONS, hasPermission, type Role } from "../../../lib/frank";
import { Metric, SectionHeader, roleNames as staffNames, type CrmFocus, type CrmThreadSummary } from "../shared/broker-foundation";
import { CrmFilters, ThreadList, type ThreadFilters } from "./thread-list";
import { ThreadDetail, type ThreadAction } from "./thread-detail";
import { emptyFilters, postThreadAction, useThreadDetail, useThreadList } from "./use-threads";
import { EscalationDrawer } from "./escalation-drawer";

/** Broker users who can own a conversation, derived from the demo identity map. */
const teammates = (Object.entries(staffNames) as [Role, string][])
  .filter(([role]) => hasPermission(role, CRM_PERMISSIONS.reply))
  .map(([role, name]) => ({ id: `usr_${role}`, name }));

export function CrmInboxPage({
  role, focus, clients, onNotify, onNewThread, onOpenRelated,
}: {
  role: Role;
  focus: CrmFocus;
  clients: BrokerClient[];
  onNotify: (message: string, tone?: "success" | "error") => void;
  onNewThread: () => void;
  onOpenRelated?: (type: string, id: string) => void;
}) {
  const [filters, setFilters] = useState<ThreadFilters>(focus?.status ? { ...emptyFilters, status: focus.status } : emptyFilters);
  // `focus.threadId` seeds the selection; the shell remounts this screen with a
  // new key when a notification deep-links, so no prop-to-state sync is needed.
  const [selectedId, setSelectedId] = useState<string | null>(focus?.threadId ?? null);
  const [detailToken, setDetailToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [escalation, setEscalation] = useState<"task" | "case" | null>(null);
  const { threads, facets, loading, refresh } = useThreadList(role, filters, focus?.clientId);
  // On wide screens the detail pane shows the first row until one is picked;
  // derived rather than synced, so there is no cascading render.
  const shownId = selectedId ?? threads[0]?.id ?? null;
  const { thread } = useThreadDetail(role, shownId, detailToken);

  const open = (summary: CrmThreadSummary) => {
    setSelectedId(summary.id);
    if (summary.unread > 0) {
      void postThreadAction(role, summary.id, "read", {}).then(refresh).catch(() => undefined);
    }
  };

  const act = async (action: ThreadAction, payload: Record<string, unknown>, files: File[]) => {
    if (!shownId) return false;
    setBusy(true);
    try {
      await postThreadAction(role, shownId, action, payload, files);
      setDetailToken((token) => token + 1);
      refresh();
      onNotify(action === "note" ? "Internal note saved. The investor cannot see it." : action === "reply" ? "Reply sent to the investor." : "Conversation updated.");
      return true;
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "The conversation could not be updated.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const clientName = focus?.clientId ? clients.find((client) => client.id === focus.clientId)?.name : undefined;

  return <>
    <SectionHeader
      eyebrow="CLIENT CONVERSATIONS"
      title={clientName ? `Conversations · ${clientName}` : "Conversations"}
      copy="Investor questions, requests, and complaints in one queue - with internal notes your team can see but investors cannot."
      action={hasPermission(role, CRM_PERMISSIONS.create) ? <button className="btn primary" onClick={onNewThread}>+ New conversation</button> : undefined}
    />
    <section className="metric-grid crm-metrics">
      <Metric label="Unread" value={String(facets.unreadThreads)} note="Conversations with new investor messages" tone={facets.unreadThreads ? "warning" : "success"} />
      <Metric label="Assigned to me" value={String(facets.mine)} note="Open conversations you own" tone="brand" />
      <Metric label="Unassigned" value={String(facets.unassigned)} note="Waiting for an owner" tone={facets.unassigned ? "danger" : "success"} />
      <Metric label="In view" value={String(threads.length)} note="Matching the current filters" tone="purple" />
    </section>

    <div className="crm-split" data-pane={selectedId ? "detail" : "list"}>
      <section className="panel crm-pane-list">
        <CrmFilters value={filters} onChange={setFilters} facets={facets} />
        <ThreadList threads={threads} selectedId={shownId} loading={loading} onOpen={open} />
      </section>
      <section className="panel crm-pane-detail">
        {thread ? (
          <ThreadDetail
            thread={thread}
            role={role}
            busy={busy}
            teammates={teammates}
            onBack={() => setSelectedId(null)}
            onAction={act}
            onOpenRelated={onOpenRelated}
            onCreateTask={() => setEscalation("task")}
            onOpenCase={() => setEscalation("case")}
          />
        ) : (
          <div className="crm-detail-empty">
            <b>Select a conversation</b>
            <p>Pick a conversation on the left to read the history and reply.</p>
          </div>
        )}
      </section>
    </div>

    {escalation && thread && (
      <EscalationDrawer
        mode={escalation}
        role={role}
        threadId={thread.id}
        clientId={thread.client?.id ?? ""}
        subject={thread.subject}
        teammates={teammates}
        onClose={() => setEscalation(null)}
        onDone={(message) => { setDetailToken((token) => token + 1); refresh(); onNotify(message); }}
      />
    )}
  </>;
}
