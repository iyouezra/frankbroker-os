"use client";

import { useState } from "react";
import { CASE_SEVERITIES } from "../../../lib/crm/cases";
import { TASK_TEMPLATES } from "../../../lib/crm/tasks";
import { BROKER_TENANT_ID } from "../shared/broker-foundation";
import type { Role } from "../../../lib/frank";

/** Default a follow-up to three business-ish days out; the officer can change it. */
function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

/**
 * The two escalations a conversation can produce: a follow-up task someone owes
 * the investor, or a formal complaint case. Both link back to the thread, so the
 * conversation stays the single record of what was actually said.
 */
export function EscalationDrawer({
  mode, role, threadId, clientId, subject, teammates, onClose, onDone,
}: {
  mode: "task" | "case";
  role: Role;
  threadId: string;
  clientId: string;
  subject: string;
  teammates: Array<{ id: string; name: string }>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [taskType, setTaskType] = useState<string>(TASK_TEMPLATES[0].type);
  const [title, setTitle] = useState<string>(TASK_TEMPLATES[0].title);
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [priority, setPriority] = useState("normal");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [caseSubject, setCaseSubject] = useState(subject);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pickTemplate = (type: string) => {
    setTaskType(type);
    const template = TASK_TEMPLATES.find((item) => item.type === type);
    if (template) setTitle(template.title);
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const url = mode === "task" ? "/api/crm/tasks" : "/api/crm/cases";
      const body = mode === "task"
        ? { clientId, threadId, taskType, title, description, dueDate, priority, assignedToUserId: assignedToUserId || null }
        : { threadId, severity, subject: caseSubject };
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-frank-tenant-id": BROKER_TENANT_ID, "x-frank-demo-role": role },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "This could not be saved.");
      onDone(mode === "task" ? "Follow-up task created." : "Complaint opened and linked to this conversation.");
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const valid = mode === "task" ? title.trim().length >= 3 : caseSubject.trim().length >= 4;

  return <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={mode === "task" ? "Add follow-up task" : "Open complaint"}>
      <div className="drawer-content">
        <div className="drawer-title">
          <span className="eyebrow">{mode === "task" ? "FOLLOW-UP TASK" : "OPEN COMPLAINT"}</span>
          <h2>{subject}</h2>
          <p>{mode === "task" ? "Record what someone owes this investor next, and by when." : "Raises a formal case from this conversation. The thread stays intact and links to the case."}</p>
        </div>

        {mode === "task" ? (
          <div className="form-section">
            <label>Task type
              <div className="brand-select">
                <select value={taskType} onChange={(event) => pickTemplate(event.target.value)}>
                  {TASK_TEMPLATES.map((template) => <option key={template.type} value={template.type}>{template.title}</option>)}
                </select><i>⌄</i>
              </div>
            </label>
            <label>Title<input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>Details<textarea rows={3} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="What needs doing, and anything the next person should know." /></label>
            <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <label>Priority
              <div className="brand-select">
                <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                  {["low", "normal", "high", "urgent"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select><i>⌄</i>
              </div>
            </label>
            <label>Owner
              <div className="brand-select">
                <select value={assignedToUserId} onChange={(event) => setAssignedToUserId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {teammates.map((mate) => <option key={mate.id} value={mate.id}>{mate.name}</option>)}
                </select><i>⌄</i>
              </div>
            </label>
          </div>
        ) : (
          <div className="form-section">
            <label>Case subject<input value={caseSubject} maxLength={160} onChange={(event) => setCaseSubject(event.target.value)} /></label>
            <label>Severity
              <div className="brand-select">
                <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                  {CASE_SEVERITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select><i>⌄</i>
              </div>
            </label>
            <div className="settings-note">Severity sets the target resolution date. The conversation is marked as a complaint and its priority is raised.</div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="drawer-actions">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !valid} onClick={() => void submit()}>{busy ? "Saving…" : mode === "task" ? "Create task" : "Open complaint"}</button>
        </div>
      </div>
    </aside>
  </div>;
}
