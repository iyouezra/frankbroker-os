"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CRM_PERMISSIONS, hasPermission, roleLabels, type Role } from "../../../lib/frank";
import { CATEGORY_LABELS, RELATED_TYPE_LABELS, type RelatedType, type ThreadCategory } from "../../../lib/crm/categories";
import { THREAD_STATUS_LABELS, availableThreadStatuses, isThreadClosed, type ThreadStatus } from "../../../lib/crm/status";
import { auditTime, type CrmAttachment, type CrmMessage, type CrmThreadDetail } from "../shared/broker-foundation";
import { postThreadAction } from "./use-threads";
import { PriorityBadge } from "./thread-list";
import { BrandSelect } from "../../shared/brand-select";

const fileSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function AttachmentList({ attachments, basePath }: { attachments: CrmAttachment[]; basePath: string }) {
  if (!attachments.length) return null;
  return <span className="crm-attachments">
    {attachments.map((attachment) => (
      <a key={attachment.id} className="crm-attachment" href={`${basePath}/${encodeURIComponent(attachment.id)}`} target="_blank" rel="noreferrer">
        {attachment.name} <em>{fileSize(attachment.sizeBytes)}</em>
      </a>
    ))}
  </span>;
}

/** One message. Internal notes get a distinct treatment and an explicit label so
 *  a broker can never mistake a private note for something the investor saw. */
export function MessageBubble({ message }: { message: CrmMessage }) {
  const internal = message.visibility === "internal";
  const fromInvestor = message.authorType === "investor";
  return <article className={`crm-bubble${fromInvestor ? " investor" : ""}`} data-visibility={message.visibility}>
    <header>
      <b>{fromInvestor ? "Investor" : message.authorName}</b>
      {internal && <span className="crm-internal-tag">Internal note</span>}
      <time>{auditTime(message.createdAt)}</time>
    </header>
    <p>{message.body}</p>
    <AttachmentList attachments={message.attachments} basePath="/api/crm/attachments" />
    {!internal && !fromInvestor && <small className={`crm-receipt ${message.readAt ? "read" : ""}`} title={message.readAt ? `Opened ${auditTime(message.readAt)}` : message.deliveredAt ? `Placed in the client’s in-app inbox ${auditTime(message.deliveredAt)}; device delivery is not tracked.` : "Sent; historical delivery time is not recorded."}><span aria-hidden="true">{message.readAt || message.deliveredAt ? "✓✓" : "✓"}</span> {message.readAt ? "Read" : message.deliveredAt ? "Delivered to inbox" : "Sent"}</small>}
    {internal && <small className="crm-internal-hint">Only your team can see internal notes.</small>}
  </article>;
}

export function RelatedRecordCard({ thread, onOpenRelated }: { thread: CrmThreadDetail; onOpenRelated?: (type: string, id: string) => void }) {
  if (!thread.relatedType || !thread.relatedId) return null;
  const label = RELATED_TYPE_LABELS[thread.relatedType as RelatedType] ?? thread.relatedType;
  return <div className="crm-related">
    <span><small>RELATED RECORD</small><b>{label} · {thread.relatedId}</b></span>
    {onOpenRelated && thread.relatedType !== "service_request" && <button className="btn secondary small" onClick={() => onOpenRelated(thread.relatedType!, thread.relatedId!)}>Open record</button>}
  </div>;
}

export type ThreadAction = "reply" | "note" | "assign" | "status" | "priority" | "service_request";

export function ThreadDetail({
  thread, role, busy, teammates, onBack, onAction, onOpenRelated, onOpenCase, onCreateTask,
}: {
  thread: CrmThreadDetail;
  role: Role;
  busy: boolean;
  teammates: { id: string; name: string }[];
  onBack?: () => void;
  onAction: (action: ThreadAction, payload: Record<string, unknown>, files: File[]) => Promise<boolean>;
  // Servicing escalations. Optional so surfaces that only read a thread can omit them.
  onOpenCase?: () => void;
  onCreateTask?: () => void;
  onOpenRelated?: (type: string, id: string) => void;
}) {
  const detailElement = useRef<HTMLDivElement>(null);
  const displayedIds = JSON.stringify(thread.messages.filter((message) => message.authorType === "investor" && message.visibility === "shared" && !message.readAt).map((message) => message.id));
  useEffect(() => {
    const element = detailElement.current;
    if (!element || displayedIds === "[]") return;
    let acknowledged = false;
    let visible = false;
    const acknowledge = () => {
      if (acknowledged || !visible || document.visibilityState !== "visible") return;
      acknowledged = true;
      void postThreadAction(role, thread.id, "read", { messageIds: JSON.parse(displayedIds) }).catch(() => { acknowledged = false; });
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; acknowledge(); });
    observer.observe(element);
    document.addEventListener("visibilitychange", acknowledge);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", acknowledge); };
  }, [role, thread.id, displayedIds]);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [files, setFiles] = useState<File[]>([]);
  const [requestDecision, setRequestDecision] = useState<"resolve" | "reject" | "approve_closure">("resolve");
  const [outcomeSummary, setOutcomeSummary] = useState("");
  const canReply = hasPermission(role, CRM_PERMISSIONS.reply);
  const canNote = hasPermission(role, CRM_PERMISSIONS.note);
  const canAssign = hasPermission(role, CRM_PERMISSIONS.assign);
  const canStatus = hasPermission(role, CRM_PERMISSIONS.status);
  const canPriority = hasPermission(role, CRM_PERMISSIONS.priority);
  const canOpenCase = Boolean(onOpenCase) && !thread.serviceCase && hasPermission(role, CRM_PERMISSIONS.caseManage);
  const canCreateTask = Boolean(onCreateTask) && hasPermission(role, CRM_PERMISSIONS.taskCreate);
  const canManageRequest = hasPermission(role, "adjust") && Boolean(thread.serviceRequest?.allowedDecisions.length);
  const closed = isThreadClosed(thread.status);
  const composerMode = mode === "reply" && !canReply ? "note" : mode;
  const canCompose = (composerMode === "reply" ? canReply : canNote) && !closed;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    const sent = await onAction(composerMode, { body: draft }, files);
    if (sent) { setDraft(""); setFiles([]); }
  };

  return <div className="crm-detail" ref={detailElement}>
    <header className="crm-detail-head">
      {onBack && <button className="btn secondary small crm-back" onClick={onBack}>← All conversations</button>}
      <div>
        <span className="eyebrow">{CATEGORY_LABELS[thread.category as ThreadCategory] ?? thread.category}</span>
        <h2>{thread.subject}</h2>
        <p>{thread.client?.name} · {thread.client?.code}{thread.account ? ` · ${thread.account.number}` : ""} · {thread.id}</p>
      </div>
      <div className="crm-badges">
        <span className={`status status-${thread.status === "resolved" ? "success" : thread.status === "closed" ? "neutral" : thread.status === "pending_broker" ? "warning" : "brand"}`}><i />{thread.statusLabel}</span>
        <PriorityBadge priority={thread.priority} />
      </div>
    </header>

    {thread.broadcastLabel && <div className="crm-related"><span><small>BROADCAST</small><b>{thread.broadcastLabel}</b></span></div>}
    <RelatedRecordCard thread={thread} onOpenRelated={onOpenRelated} />

    {thread.serviceRequest && <section className="crm-service-request">
      <div>
        <span className="eyebrow">CLIENT INSTRUCTION · {thread.serviceRequest.id}</span>
        <h3>{thread.serviceRequest.subject}</h3>
        <p>Status: {thread.serviceRequest.status.replaceAll("_", " ")}</p>
        {thread.serviceRequest.resolutionNotes && <p><b>Outcome:</b> {thread.serviceRequest.resolutionNotes}</p>}
      </div>
      {canManageRequest && <div className="crm-service-request-actions">
        <label>Decision
          <BrandSelect value={requestDecision} onChange={(next) => setRequestDecision(next as typeof requestDecision)} ariaLabel="Service request decision"
            options={thread.serviceRequest.allowedDecisions.map((decision) => ({ value: decision, label: decision === "approve_closure" ? "Approve account closure" : decision === "reject" ? "Reject request" : "Resolve request" }))} />
        </label>
        <label>Investor-visible outcome
          <textarea rows={3} value={outcomeSummary} maxLength={2000} onChange={(event) => setOutcomeSummary(event.target.value)} placeholder="Explain what was decided and what happens next." />
        </label>
        <button className="btn primary small" disabled={busy || outcomeSummary.trim().length < 10}
          onClick={() => void onAction("service_request", { decision: requestDecision, outcomeSummary }, [])}>
          {busy ? "Completing…" : "Complete request"}
        </button>
      </div>}
    </section>}

    <div className="crm-controls">
      {thread.serviceCase && <div className="crm-related"><span><small>FORMAL COMPLAINT</small><b>{thread.serviceCase.id} · {thread.serviceCase.status.replaceAll("_", " ")}</b></span></div>}
      <label>Owner
        <BrandSelect value={thread.assignedToUserId ?? ""} disabled={!canAssign || busy} ariaLabel="Owner"
          onChange={(next) => void onAction("assign", { assignedToUserId: next || null }, [])}
          options={[{ value: "", label: "Unassigned" }, ...teammates.map((mate) => ({ value: mate.id, label: mate.name }))]} />
      </label>
      <label>Status
        <BrandSelect value="" disabled={!canStatus || busy || !availableThreadStatuses(thread.status).length}
          placeholder={THREAD_STATUS_LABELS[thread.status as ThreadStatus] ?? thread.status} ariaLabel="Change status"
          onChange={(next) => { if (next) void onAction("status", { status: next }, []); }}
          options={availableThreadStatuses(thread.status).map((status) => ({ value: status, label: `Move to ${THREAD_STATUS_LABELS[status]}` }))} />
      </label>
      <label>Priority
        <BrandSelect value={thread.priority} disabled={!canPriority || busy} ariaLabel="Priority"
          onChange={(next) => void onAction("priority", { priority: next }, [])}
          options={["low", "normal", "high", "urgent"].map((priority) => ({ value: priority, label: priority }))} />
      </label>
      {(canOpenCase || canCreateTask) && <div className="crm-detail-actions">
        {canCreateTask && <button className="btn secondary small" disabled={busy} onClick={onCreateTask}>Add follow-up task</button>}
        {canOpenCase && <button className="btn secondary small" disabled={busy} onClick={onOpenCase}>Open complaint</button>}
      </div>}
    </div>

    <div className="crm-messages">
      {thread.messages.map((message) => <MessageBubble key={message.id} message={message} />)}
    </div>

    {closed ? (
      <div className="crm-composer-closed">This conversation is closed. Start a new one to continue with this investor.</div>
    ) : canCompose ? (
      <form className="crm-composer" onSubmit={(event) => void submit(event)}>
        <div className="crm-composer-modes">
          <button type="button" className={composerMode === "reply" ? "active" : ""} disabled={!canReply} onClick={() => setMode("reply")}>Send to investor</button>
          <button type="button" className={composerMode === "note" ? "active" : ""} disabled={!canNote} onClick={() => setMode("note")}>Add internal note</button>
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder={composerMode === "reply" ? "Write a reply the investor will see…" : "Write a note only your team can see…"}
          aria-label={composerMode === "reply" ? "Reply to investor" : "Internal note"}
        />
        <div className="crm-composer-foot">
          <input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))} aria-label="Attach files" />
          <span>{composerMode === "note" ? "Internal - never shown to the investor." : "The investor will be notified."}</span>
          <button className="btn primary" disabled={busy || !draft.trim()}>{busy ? "Sending…" : composerMode === "reply" ? "Send reply" : "Save note"}</button>
        </div>
      </form>
    ) : (
      <div className="crm-composer-closed">{roleLabels[role]} has read-only access to conversations.</div>
    )}
  </div>;
}
