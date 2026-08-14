"use client";

import { useState } from "react";
import { CASE_SEVERITIES } from "../../../lib/crm/cases";
import { TASK_TEMPLATES } from "../../../lib/crm/tasks";
import { BROKER_TENANT_ID } from "../shared/broker-foundation";
import { BrandSelect } from "../../shared/brand-select";
import type { Role } from "../../../lib/frank";
import { addisBusinessDate, shiftDateKey } from "../../../lib/addis-date";

/** Default a follow-up to three business-ish days out; the officer can change it. */
function defaultDueDate() {
  return shiftDateKey(addisBusinessDate(), 3);
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
              <BrandSelect value={taskType} onChange={pickTemplate} ariaLabel="Task type" options={TASK_TEMPLATES.map((template) => ({ value: template.type, label: template.title }))} />
            </label>
            <label>Title<input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>Details<textarea rows={3} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="What needs doing, and anything the next person should know." /></label>
            <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <label>Priority
              <BrandSelect value={priority} onChange={setPriority} ariaLabel="Priority" options={["low", "normal", "high", "urgent"].map((value) => ({ value, label: value }))} />
            </label>
            <label>Owner
              <BrandSelect value={assignedToUserId} onChange={setAssignedToUserId} ariaLabel="Owner" options={[{ value: "", label: "Unassigned" }, ...teammates.map((mate) => ({ value: mate.id, label: mate.name }))]} />
            </label>
          </div>
        ) : (
          <div className="form-section">
            <label>Case subject<input value={caseSubject} maxLength={160} onChange={(event) => setCaseSubject(event.target.value)} /></label>
            <label>Severity
              <BrandSelect value={severity} onChange={setSeverity} ariaLabel="Severity" options={CASE_SEVERITIES.map((value) => ({ value, label: value }))} />
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
