"use client";

import { useMemo, useState } from "react";
import {
  TIMELINE_FILTERS,
  TIMELINE_FILTER_LABELS,
  buildClientTimeline,
  filterTimeline,
  timelineCounts,
  type TimelineFilter,
  type TimelineInput,
} from "../../../lib/crm/timeline";
import { EmptyState, Icon, auditTime } from "../shared/broker-foundation";

/**
 * One chronological view of everything that has happened with an investor.
 * Entries summarise and link; they never restate what a detail screen already
 * shows.
 */
export function ActivityTimeline({ data, onOpenRecord }: { data: TimelineInput; onOpenRecord?: (type: string, id: string) => void }) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const events = useMemo(() => buildClientTimeline(data), [data]);
  const counts = useMemo(() => timelineCounts(events), [events]);
  const shown = filterTimeline(events, filter);

  return <section className="panel">
    <div className="panel-head">
      <div><span className="eyebrow">CLIENT ACTIVITY</span><h2>Everything, newest first</h2></div>
      <span className="account-number">{events.length} events</span>
    </div>
    <div className="filter-row crm-timeline-filters">
      {TIMELINE_FILTERS.map((value) => (
        <button key={value} className={`filter${filter === value ? " active" : ""}`} onClick={() => setFilter(value)} disabled={counts[value] === 0 && value !== "all"}>
          {TIMELINE_FILTER_LABELS[value]} <b>{counts[value]}</b>
        </button>
      ))}
    </div>
    {shown.length === 0 ? (
      <EmptyState title="Nothing here yet" copy="Conversations, tasks, transactions, and account changes will appear on this timeline." />
    ) : (
      <ol className="crm-timeline">
        {shown.map((event) => (
          <li key={event.id} data-tone={event.tone ?? "info"}>
            <i className="crm-timeline-icon"><Icon name={event.icon} size={16} /></i>
            <div>
              <span className="crm-timeline-top">
                <b>{event.title}</b>
                <time>{auditTime(event.at)}</time>
              </span>
              <p>{event.detail}</p>
              <span className="crm-timeline-meta">
                {event.actor && <em>{event.actor}</em>}
                {event.link && onOpenRecord && (
                  <button className="crm-linkish" onClick={() => onOpenRecord(event.link!.type, event.link!.id)}>
                    Open {event.link.type.replaceAll("_", " ")}
                  </button>
                )}
              </span>
            </div>
          </li>
        ))}
      </ol>
    )}
  </section>;
}
