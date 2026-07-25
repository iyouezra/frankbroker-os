"use client";

import { useState } from "react";
import { CRM_PERMISSIONS, hasPermission, type Role } from "../../../lib/frank";
import { auditTime, initials, roleNames, type CrmAssignmentView } from "../shared/broker-foundation";

const officers = (Object.entries(roleNames) as [Role, string][])
  .filter(([role]) => hasPermission(role, CRM_PERMISSIONS.view) && role !== "super_admin" && role !== "management")
  .map(([role, name]) => ({ id: `usr_${role}`, name }));

/**
 * Who owns the relationship with this investor, plus the trail of who owned it
 * before. Reassignment ends the previous record rather than overwriting it.
 */
export function RelationshipOfficerCard({
  current, history, role, busy, onAssign,
}: {
  current: CrmAssignmentView | null;
  history: CrmAssignmentView[];
  role: Role;
  busy: boolean;
  onAssign: (primaryOfficerId: string | null) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const canAssign = hasPermission(role, CRM_PERMISSIONS.relationshipAssign);
  const past = history.filter((item) => !item.current);

  return <section className="panel crm-officer">
    <div className="panel-head">
      <div><span className="eyebrow">RELATIONSHIP</span><h2>Relationship officer</h2></div>
      {past.length > 0 && <button className="text-button" onClick={() => setShowHistory((value) => !value)}>{showHistory ? "Hide history" : `History (${past.length})`}</button>}
    </div>
    <div className="panel-body">
      <div className="crm-officer-current">
        <span className="crm-officer-avatar">{current?.primaryOfficerName ? initials(current.primaryOfficerName) : "—"}</span>
        <div>
          <b>{current?.primaryOfficerName ?? "No officer assigned"}</b>
          <small>{current?.primaryOfficerName ? `Primary contact${current.backupOfficerName ? ` · backup ${current.backupOfficerName}` : ""}` : "This investor has no named owner."}</small>
          {current?.assignedAt && <em>Since {auditTime(current.assignedAt)}{current.assignedByName ? ` · by ${current.assignedByName}` : ""}</em>}
        </div>
      </div>

      {canAssign && (
        <label className="crm-officer-assign">Assign to
          <div className="brand-select">
            <select value={current?.primaryOfficerId ?? ""} disabled={busy} onChange={(event) => onAssign(event.target.value || null)}>
              <option value="">Unassigned</option>
              {officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name}</option>)}
            </select><i>⌄</i>
          </div>
        </label>
      )}

      {showHistory && (
        <ol className="crm-officer-history">
          {past.map((item) => (
            <li key={item.id}>
              <b>{item.primaryOfficerName ?? "Unassigned"}</b>
              <span>{auditTime(item.assignedAt)} → {item.endedAt ? auditTime(item.endedAt) : "—"}</span>
              {item.assignedByName && <em>set by {item.assignedByName}</em>}
            </li>
          ))}
        </ol>
      )}
    </div>
  </section>;
}
