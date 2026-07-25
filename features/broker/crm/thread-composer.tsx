"use client";

import { type FormEvent } from "react";
import type { BrokerClient } from "../../../lib/demo-data";
import { CATEGORY_LABELS, RELATED_TYPES, RELATED_TYPE_LABELS, THREAD_CATEGORIES, type RelatedType, type ThreadCategory } from "../../../lib/crm/categories";
import type { NewThreadValue } from "../shared/broker-foundation";

export function NewThreadForm({
  value, setValue, clients, busy, onCancel, onSubmit,
}: {
  value: NewThreadValue;
  setValue: (next: NewThreadValue) => void;
  clients: BrokerClient[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const set = <K extends keyof NewThreadValue>(key: K, next: NewThreadValue[K]) => setValue({ ...value, [key]: next });
  const ready = value.clientId && value.subject.trim().length >= 4 && value.body.trim().length >= 2;

  return <form className="drawer-content" onSubmit={onSubmit}>
    <div className="drawer-title">
      <span className="eyebrow">CLIENT CONVERSATIONS</span>
      <h2>Start a conversation</h2>
      <p>The investor sees this immediately in their support centre and is notified.</p>
    </div>
    <div className="form-section">
      <label>Investor
        <div className="brand-select">
          <select value={value.clientId} onChange={(event) => set("clientId", event.target.value)} required>
            <option value="">Select an investor…</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.code} · {client.name}</option>)}
          </select><i>⌄</i>
        </div>
      </label>
      <div className="field-row">
        <label>Category
          <div className="brand-select">
            <select value={value.category} onChange={(event) => set("category", event.target.value)}>
              {THREAD_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category as ThreadCategory]}</option>)}
            </select><i>⌄</i>
          </div>
        </label>
        <label>Priority
          <div className="brand-select">
            <select value={value.priority} onChange={(event) => set("priority", event.target.value)}>
              {["low", "normal", "high", "urgent"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select><i>⌄</i>
          </div>
        </label>
      </div>
      <label>Subject
        <input value={value.subject} onChange={(event) => set("subject", event.target.value)} maxLength={160} placeholder="What is this about?" required />
      </label>
      <label>Message
        <textarea value={value.body} onChange={(event) => set("body", event.target.value)} rows={4} maxLength={4000} placeholder="Write the message the investor will read…" required />
      </label>
      <div className="field-row">
        <label>Related record (optional)
          <div className="brand-select">
            <select value={value.relatedType} onChange={(event) => set("relatedType", event.target.value)}>
              <option value="">None</option>
              {RELATED_TYPES.map((type) => <option key={type} value={type}>{RELATED_TYPE_LABELS[type as RelatedType]}</option>)}
            </select><i>⌄</i>
          </div>
        </label>
        <label>Reference
          <input value={value.relatedId} onChange={(event) => set("relatedId", event.target.value)} placeholder="ORD-2026-1048" disabled={!value.relatedType} />
        </label>
      </div>
    </div>
    <div className="drawer-actions">
      <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
      <button className="btn primary" disabled={busy || !ready}>{busy ? "Sending…" : "Send to investor"}</button>
    </div>
  </form>;
}
