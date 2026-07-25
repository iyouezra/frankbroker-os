"use client";

import { useEffect, useState } from "react";
import { CRM_PERMISSIONS, hasPermission, type Role } from "../../../lib/frank";
import { TASK_STATUS_LABELS, availableTaskStatuses, isTaskClosed, type TaskStatus } from "../../../lib/crm/tasks";
import { priorityTone } from "../../../lib/crm/categories";
import {
  BROKER_TENANT_ID,
  EmptyState,
  Metric,
  SectionHeader,
  auditTime,
  fallbackCrmTasks,
  type CrmTaskView,
  type CrmTasksResponse,
} from "../shared/broker-foundation";

const BUCKET_LABELS: Record<string, string> = { overdue: "Overdue", today: "Due today", upcoming: "Upcoming", no_due_date: "No due date", completed: "Completed" };

export function TaskCard({ task, role, busy, onStatus, onEscalate, onOpenClient }: {
  task: CrmTaskView;
  role: Role;
  busy: boolean;
  onStatus: (task: CrmTaskView, next: string) => void;
  onEscalate: (task: CrmTaskView) => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const canComplete = hasPermission(role, CRM_PERMISSIONS.taskComplete);
  const canProgress = hasPermission(role, CRM_PERMISSIONS.taskCreate);
  const canEscalate = hasPermission(role, CRM_PERMISSIONS.taskAssign);
  const closed = isTaskClosed(task.status);
  const overdue = task.bucket === "overdue";

  return <article className={`crm-task${overdue ? " overdue" : ""}${closed ? " done" : ""}`}>
    <div className="crm-task-main">
      <span className="crm-task-top">
        <b>{task.title}</b>
        {task.escalated && <em className="crm-escalated" title="Escalated">Escalated</em>}
        <span className={`status status-${priorityTone(task.priority)}`}><i />{task.priority}</span>
      </span>
      {task.description && <p>{task.description}</p>}
      <span className="crm-task-meta">
        <button className="crm-linkish" onClick={() => task.client && onOpenClient?.(task.client.id)} disabled={!task.client || !onOpenClient}>
          {task.client?.name ?? "Client"}
        </button>
        <span className={`status status-${closed ? "success" : overdue ? "danger" : "brand"}`}><i />{task.statusLabel}</span>
        <span className="crm-task-due">{task.dueDate ? `${BUCKET_LABELS[task.bucket]} · ${task.dueDate}` : "No due date"}</span>
        <span className="crm-owner">{task.assignedToName ?? "Unassigned"}</span>
      </span>
      {task.completionNote && <p className="crm-task-note">{task.completionNote} — {task.completedByName} · {auditTime(task.completedAt ?? task.createdAt)}</p>}
    </div>
    {!closed && (
      <div className="crm-task-actions">
        <div className="brand-select">
          <select value="" disabled={busy || !canProgress} onChange={(event) => { if (event.target.value) onStatus(task, event.target.value); }} aria-label={`Update ${task.title}`}>
            <option value="">Update…</option>
            {availableTaskStatuses(task.status)
              .filter((status) => status !== "completed" || canComplete)
              .map((status) => <option key={status} value={status}>{TASK_STATUS_LABELS[status as TaskStatus]}</option>)}
          </select><i>⌄</i>
        </div>
        {canEscalate && <button className="btn secondary small" disabled={busy} onClick={() => onEscalate(task)}>{task.escalated ? "De-escalate" : "Escalate"}</button>}
      </div>
    )}
  </article>;
}

export function MyTasksPage({ role, onNotify, onOpenClient }: { role: Role; onNotify: (message: string, tone?: "success" | "error") => void; onOpenClient?: (clientId: string) => void }) {
  const [tasks, setTasks] = useState<CrmTaskView[]>([]);
  const [facets, setFacets] = useState({ overdue: 0, today: 0, upcoming: 0, no_due_date: 0, completed: 0 });
  const [scope, setScope] = useState<"mine" | "all" | "unassigned">("mine");
  const [status, setStatus] = useState("open_all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [completing, setCompleting] = useState<CrmTaskView | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ status });
        if (scope !== "all") params.set("scope", scope);
        const response = await fetch(`/api/crm/tasks?${params}`, { signal: controller.signal, headers: { "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role } });
        if (!response.ok) throw new Error("Tasks unavailable");
        const data = (await response.json()) as CrmTasksResponse;
        setTasks(data.tasks);
        setFacets(data.facets);
      } catch {
        const rows = fallbackCrmTasks.filter((task) => (status === "open_all" ? !isTaskClosed(task.status) : status ? task.status === status : true));
        setTasks(rows);
        setFacets({ overdue: rows.filter((t) => t.bucket === "overdue").length, today: rows.filter((t) => t.bucket === "today").length, upcoming: rows.filter((t) => t.bucket === "upcoming").length, no_due_date: 0, completed: fallbackCrmTasks.filter((t) => isTaskClosed(t.status)).length });
      } finally {
        setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [role, scope, status, refreshKey]);

  const act = async (taskId: string, body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/crm/tasks/${encodeURIComponent(taskId)}/action`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "The task could not be updated.");
      setRefreshKey((key) => key + 1);
      onNotify(message);
      return true;
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "The task could not be updated.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (task: CrmTaskView, next: string) => {
    // Completing asks for a short note so the record says what actually happened.
    if (next === "completed") { setCompleting(task); setNote(""); return; }
    void act(task.id, { action: "status", status: next }, `Task moved to ${TASK_STATUS_LABELS[next as TaskStatus] ?? next}.`);
  };

  const confirmComplete = async () => {
    if (!completing) return;
    const done = await act(completing.id, { action: "status", status: "completed", completionNote: note }, "Task completed.");
    if (done) setCompleting(null);
  };

  const grouped = ["overdue", "today", "upcoming", "no_due_date", "completed"]
    .map((bucket) => ({ bucket, items: tasks.filter((task) => task.bucket === bucket) }))
    .filter((group) => group.items.length > 0);

  return <>
    <SectionHeader eyebrow="FOLLOW-UPS" title="My tasks" copy="What you owe an investor next, and by when." />
    <section className="metric-grid crm-metrics">
      <Metric label="Overdue" value={String(facets.overdue)} note="Past their due date" tone={facets.overdue ? "danger" : "success"} />
      <Metric label="Due today" value={String(facets.today)} note="Close these before end of day" tone={facets.today ? "warning" : "success"} />
      <Metric label="Upcoming" value={String(facets.upcoming)} note="Scheduled ahead" tone="brand" />
      <Metric label="Completed" value={String(facets.completed)} note="Recently closed" tone="success" />
    </section>

    <div className="filter-row crm-task-filters">
      {(["mine", "unassigned", "all"] as const).map((value) => (
        <button key={value} className={`filter${scope === value ? " active" : ""}`} onClick={() => setScope(value)}>
          {value === "mine" ? "Assigned to me" : value === "unassigned" ? "Unassigned" : "Everyone"}
        </button>
      ))}
      <span />
      <div className="brand-select">
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter tasks by status">
          <option value="open_all">Open tasks</option>
          <option value="">Any status</option>
          {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select><i>⌄</i>
      </div>
    </div>

    {loading ? <div className="crm-loading" role="status">Loading tasks…</div>
      : grouped.length === 0 ? <section className="panel"><EmptyState title="Nothing outstanding" copy="No tasks match this view. Create one from a conversation or a client's record." /></section>
      : grouped.map((group) => (
        <section className="panel crm-task-group" key={group.bucket}>
          <div className="panel-head"><div><span className="eyebrow">{BUCKET_LABELS[group.bucket]}</span><h2>{group.items.length} {group.items.length === 1 ? "task" : "tasks"}</h2></div></div>
          <div className="crm-task-list">
            {group.items.map((task) => (
              <TaskCard key={task.id} task={task} role={role} busy={busy} onStatus={changeStatus} onEscalate={(item) => void act(item.id, { action: "escalate", escalated: !item.escalated }, item.escalated ? "Task de-escalated." : "Task escalated.")} onOpenClient={onOpenClient} />
            ))}
          </div>
        </section>
      ))}

    {completing && (
      <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setCompleting(null); }}>
        <aside className="drawer" role="dialog" aria-modal="true" aria-label="Complete task">
          <div className="drawer-content">
            <div className="drawer-title"><span className="eyebrow">COMPLETE TASK</span><h2>{completing.title}</h2><p>Record what was done. This is kept with the task for audit.</p></div>
            <div className="form-section">
              <label>Completion note<textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="What did you do, and what did the investor agree?" /></label>
            </div>
            <div className="drawer-actions">
              <button className="btn secondary" onClick={() => setCompleting(null)}>Cancel</button>
              <button className="btn primary" disabled={busy} onClick={() => void confirmComplete()}>{busy ? "Saving…" : "Mark complete"}</button>
            </div>
          </div>
        </aside>
      </div>
    )}
  </>;
}
