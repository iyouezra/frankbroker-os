/**
 * The Client 360 activity timeline.
 *
 * This deliberately owns no storage. Every entry is derived from a record that
 * already exists - conversations, tasks, cases, orders, cash movements,
 * documents, notes, audit rows - and links back to it rather than restating its
 * detail. Pure and browser-safe so the merge and filter rules are unit-testable.
 */

export const TIMELINE_FILTERS = ["all", "communication", "tasks", "transactions", "kyc", "account"] as const;
export type TimelineFilter = (typeof TIMELINE_FILTERS)[number];

export const TIMELINE_FILTER_LABELS: Record<TimelineFilter, string> = {
  all: "Everything",
  communication: "Communication",
  tasks: "Tasks",
  transactions: "Transactions",
  kyc: "KYC & documents",
  account: "Account activity",
};

export type TimelineGroup = Exclude<TimelineFilter, "all">;

export type TimelineEvent = {
  id: string;
  group: TimelineGroup;
  kind: string;
  icon: string;
  title: string;
  detail: string;
  at: string;
  actor?: string | null;
  /** Where the underlying record lives, so the timeline never duplicates it. */
  link?: { type: string; id: string } | null;
  tone?: "info" | "success" | "warning" | "danger";
};

export type TimelineInput = {
  threads?: Array<{ id: string; subject: string; category: string; status: string; statusLabel?: string; lastMessageAt: string; createdAt: string; lastMessagePreview?: string | null; assignedToName?: string | null }>;
  tasks?: Array<{ id: string; title: string; status: string; dueDate?: string | null; createdAt: string; completedAt?: string | null; assignedToName?: string | null; completionNote?: string | null }>;
  cases?: Array<{ id: string; subject: string; status: string; severity: string; openedAt: string; resolvedAt?: string | null; assignedToName?: string | null }>;
  orders?: Array<{ id: string; symbol: string; side: string; status: string; createdAt: string; quantity?: number }>;
  transactions?: Array<{ id: string; type: string; amount: number; valueDate: string; reference?: string | null }>;
  documents?: Array<{ id: string; documentType: string; status: string; uploadedAt: string }>;
  notes?: Array<{ id: string; text: string; category: string; createdAt: string; createdBy?: string | null }>;
  auditTrail?: Array<{ id?: string; action: string; summary: string; createdAt: string; actor?: string | null; entityType?: string | null; entityId?: string | null }>;
};

const iso = (value: string | Date) => (typeof value === "string" ? value : value.toISOString());

/** Audit actions that belong on a client timeline, mapped to a group. */
const AUDIT_GROUPS: { match: RegExp; group: TimelineGroup; icon: string }[] = [
  { match: /^CLIENT_(APPROVED|REJECTED|CREATED|SUBMITTED)/, group: "kyc", icon: "clients" },
  { match: /^CLIENT_DOCUMENT/, group: "kyc", icon: "reports" },
  { match: /KYC/, group: "kyc", icon: "clients" },
  { match: /^CLIENT_(RESTRICTED|RESTORED)/, group: "account", icon: "settings" },
  { match: /^CRM_RELATIONSHIP/, group: "account", icon: "users" },
  { match: /^CASH_|^CLIENT_MONEY|^MOVEMENT_/, group: "transactions", icon: "cash" },
  { match: /^ORDER_|^TRADE_|^SETTLEMENT_/, group: "transactions", icon: "orders" },
];

function auditGroup(action: string): { group: TimelineGroup; icon: string } | null {
  for (const rule of AUDIT_GROUPS) if (rule.match.test(action)) return { group: rule.group, icon: rule.icon };
  return null;
}

const humanize = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/**
 * Builds the merged, newest-first timeline. Entries summarise; the `link` points
 * at the record that owns the detail.
 */
export function buildClientTimeline(input: TimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const thread of input.threads ?? []) {
    events.push({
      id: `thread-${thread.id}`,
      group: "communication",
      kind: "conversation",
      icon: "conversations",
      title: thread.subject,
      detail: thread.lastMessagePreview ?? `${humanize(thread.category)} conversation · ${thread.statusLabel ?? humanize(thread.status)}`,
      at: iso(thread.lastMessageAt),
      actor: thread.assignedToName ?? null,
      link: { type: "thread", id: thread.id },
      tone: thread.category === "complaint" ? "warning" : "info",
    });
  }

  for (const task of input.tasks ?? []) {
    const done = Boolean(task.completedAt);
    events.push({
      id: `task-${task.id}`,
      group: "tasks",
      kind: done ? "task_completed" : "task",
      icon: "tasks",
      title: task.title,
      detail: done
        ? task.completionNote ?? "Task completed"
        : task.dueDate ? `Due ${task.dueDate}` : "No due date",
      at: iso(task.completedAt ?? task.createdAt),
      actor: task.assignedToName ?? null,
      link: { type: "task", id: task.id },
      tone: done ? "success" : "info",
    });
  }

  for (const serviceCase of input.cases ?? []) {
    events.push({
      id: `case-${serviceCase.id}`,
      group: "communication",
      kind: "case",
      icon: "complaints",
      title: `${serviceCase.subject}`,
      detail: `Case ${serviceCase.id} · ${humanize(serviceCase.status)} · ${serviceCase.severity} severity`,
      at: iso(serviceCase.resolvedAt ?? serviceCase.openedAt),
      actor: serviceCase.assignedToName ?? null,
      link: { type: "case", id: serviceCase.id },
      tone: serviceCase.resolvedAt ? "success" : "danger",
    });
  }

  for (const order of input.orders ?? []) {
    events.push({
      id: `order-${order.id}`,
      group: "transactions",
      kind: "order",
      icon: "orders",
      title: `${order.side.toUpperCase()} ${order.symbol}`,
      detail: `${order.id} · ${humanize(order.status)}`,
      at: iso(order.createdAt),
      link: { type: "order", id: order.id },
      tone: order.status === "settled" ? "success" : order.status === "rejected" ? "danger" : "info",
    });
  }

  for (const movement of input.transactions ?? []) {
    events.push({
      id: `cash-${movement.id}`,
      group: "transactions",
      kind: "cash",
      icon: "cash",
      title: humanize(movement.type),
      detail: `${movement.reference ?? movement.id}`,
      at: iso(movement.valueDate),
      link: { type: "cash_movement", id: movement.id },
      tone: "info",
    });
  }

  for (const document of input.documents ?? []) {
    events.push({
      id: `document-${document.id}`,
      group: "kyc",
      kind: "document",
      icon: "reports",
      title: humanize(document.documentType),
      detail: `Document ${humanize(document.status)}`,
      at: iso(document.uploadedAt),
      link: { type: "document", id: document.id },
      tone: document.status === "approved" ? "success" : document.status === "rejected" ? "danger" : "warning",
    });
  }

  for (const note of input.notes ?? []) {
    events.push({
      id: `note-${note.id}`,
      group: "communication",
      kind: "internal_note",
      icon: "conversations",
      title: "Internal note",
      detail: note.text.slice(0, 160),
      at: iso(note.createdAt),
      actor: note.createdBy ?? null,
      tone: "warning",
    });
  }

  // Audit rows fill the gaps (restrictions, approvals, reassignment) without
  // repeating anything already represented above.
  const represented = new Set(events.map((event) => `${event.link?.type ?? ""}:${event.link?.id ?? ""}`));
  for (const entry of input.auditTrail ?? []) {
    const mapped = auditGroup(entry.action);
    if (!mapped) continue;
    if (entry.entityId && represented.has(`order:${entry.entityId}`)) continue;
    events.push({
      id: `audit-${entry.id ?? `${entry.action}-${entry.createdAt}`}`,
      group: mapped.group,
      kind: "audit",
      icon: mapped.icon,
      title: humanize(entry.action),
      detail: entry.summary,
      at: iso(entry.createdAt),
      actor: entry.actor ?? null,
      tone: /REJECT|RESTRICT|FAIL/.test(entry.action) ? "danger" : "info",
    });
  }

  return events.sort((a, b) => b.at.localeCompare(a.at));
}

export function filterTimeline(events: TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
  return filter === "all" ? events : events.filter((event) => event.group === filter);
}

export function timelineCounts(events: TimelineEvent[]): Record<TimelineFilter, number> {
  const counts = { all: events.length, communication: 0, tasks: 0, transactions: 0, kyc: 0, account: 0 } as Record<TimelineFilter, number>;
  for (const event of events) counts[event.group] += 1;
  return counts;
}
