"use client";

import { type FormEvent } from "react";
import type { BrokerClient } from "../../../lib/demo-data";
import { CATEGORY_LABELS, RELATED_TYPES, RELATED_TYPE_LABELS, THREAD_CATEGORIES, type RelatedType, type ThreadCategory } from "../../../lib/crm/categories";
import type { NewThreadValue } from "../shared/broker-foundation";
import { BrandSelect } from "../../shared/brand-select";

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
        <BrandSelect
          value={value.clientId}
          onChange={(next) => set("clientId", next)}
          placeholder="Select an investor…"
          ariaLabel="Investor"
          options={clients.map((client) => ({ value: client.id, label: `${client.code} · ${client.name}` }))}
        />
      </label>
      <div className="field-row">
        <label>Category
          <BrandSelect
            value={value.category}
            onChange={(next) => set("category", next)}
            ariaLabel="Category"
            options={THREAD_CATEGORIES.map((category) => ({ value: category, label: CATEGORY_LABELS[category as ThreadCategory] }))}
          />
        </label>
        <label>Priority
          <BrandSelect
            value={value.priority}
            onChange={(next) => set("priority", next)}
            ariaLabel="Priority"
            options={["low", "normal", "high", "urgent"].map((priority) => ({ value: priority, label: priority }))}
          />
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
          <BrandSelect
            value={value.relatedType}
            onChange={(next) => set("relatedType", next)}
            ariaLabel="Related record"
            options={[{ value: "", label: "None" }, ...RELATED_TYPES.map((type) => ({ value: type, label: RELATED_TYPE_LABELS[type as RelatedType] }))]}
          />
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
