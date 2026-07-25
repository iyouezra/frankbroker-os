"use client";

import { CATEGORY_LABELS, THREAD_CATEGORIES, priorityTone, type ThreadCategory } from "../../../lib/crm/categories";
import { THREAD_STATUSES, THREAD_STATUS_LABELS, type ThreadStatus } from "../../../lib/crm/status";
import { EmptyState, auditTime, type CrmThreadSummary } from "../shared/broker-foundation";

export type ThreadFilters = { status: string; category: string; priority: string; assigned: string; query: string };

export function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`status status-${priorityTone(priority)}`}><i />{priority}</span>;
}

export function CrmFilters({ value, onChange, facets }: { value: ThreadFilters; onChange: (next: ThreadFilters) => void; facets: { unreadThreads: number; mine: number; unassigned: number } }) {
  const set = <K extends keyof ThreadFilters>(key: K, next: ThreadFilters[K]) => onChange({ ...value, [key]: next });
  return <div className="crm-filters">
    <label className="crm-search">
      <input value={value.query} onChange={(event) => set("query", event.target.value)} placeholder="Search investor, subject, or reference…" aria-label="Search conversations" />
    </label>
    <div className="filter-row">
      <button className={`filter${value.assigned === "" ? " active" : ""}`} onClick={() => set("assigned", "")}>All</button>
      <button className={`filter${value.assigned === "me" ? " active" : ""}`} onClick={() => set("assigned", "me")}>Mine <b>{facets.mine}</b></button>
      <button className={`filter${value.assigned === "unassigned" ? " active" : ""}`} onClick={() => set("assigned", "unassigned")}>Unassigned <b>{facets.unassigned}</b></button>
      <span />
      <div className="brand-select"><select value={value.status} onChange={(event) => set("status", event.target.value)} aria-label="Filter by status">
        <option value="open_all">Needs attention</option>
        <option value="">Any status</option>
        {THREAD_STATUSES.map((status) => <option key={status} value={status}>{THREAD_STATUS_LABELS[status as ThreadStatus]}</option>)}
      </select><i>⌄</i></div>
      <div className="brand-select"><select value={value.category} onChange={(event) => set("category", event.target.value)} aria-label="Filter by category">
        <option value="">Any category</option>
        {THREAD_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category as ThreadCategory]}</option>)}
      </select><i>⌄</i></div>
      <div className="brand-select"><select value={value.priority} onChange={(event) => set("priority", event.target.value)} aria-label="Filter by priority">
        <option value="">Any priority</option>
        {["urgent", "high", "normal", "low"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
      </select><i>⌄</i></div>
    </div>
  </div>;
}

export function ThreadListItem({ thread, active, onOpen }: { thread: CrmThreadSummary; active: boolean; onOpen: () => void }) {
  const isComplaint = thread.category === "complaint";
  return <button className={`crm-row${active ? " active" : ""}${thread.unread > 0 ? " unread" : ""}`} onClick={onOpen} aria-current={active ? "true" : undefined}>
    <span className="crm-row-top">
      <b>{thread.client?.name ?? "Investor"}</b>
      {thread.unread > 0 && <em className="crm-unread" aria-label={`${thread.unread} unread`}>{thread.unread}</em>}
      <time>{auditTime(thread.lastMessageAt)}</time>
    </span>
    <span className="crm-row-subject">{isComplaint && <i className="crm-flag" title="Complaint">!</i>}{thread.subject}</span>
    {thread.lastMessagePreview && <span className="crm-row-preview">{thread.lastMessagePreview}</span>}
    <span className="crm-row-meta">
      <span className={`status status-${thread.status === "resolved" ? "success" : thread.status === "closed" ? "neutral" : thread.status === "pending_broker" ? "warning" : "brand"}`}><i />{thread.statusLabel}</span>
      <span className="crm-chip">{CATEGORY_LABELS[thread.category as ThreadCategory] ?? thread.category}</span>
      <span className="crm-owner">{thread.assignedToName ?? "Unassigned"}</span>
    </span>
  </button>;
}

export function ThreadList({ threads, selectedId, loading, onOpen }: { threads: CrmThreadSummary[]; selectedId: string | null; loading: boolean; onOpen: (thread: CrmThreadSummary) => void }) {
  if (loading) return <div className="crm-loading" role="status">Loading conversations…</div>;
  if (!threads.length) {
    return <EmptyState title="No conversations here" copy="Adjust the filters, or start a conversation from a client's record." />;
  }
  return <div className="crm-list">
    {threads.map((thread) => <ThreadListItem key={thread.id} thread={thread} active={thread.id === selectedId} onOpen={() => onOpen(thread)} />)}
  </div>;
}
