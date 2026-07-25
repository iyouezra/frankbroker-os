/**
 * Follow-up tasks. Pure and browser-safe: statuses, transitions, quick-create
 * templates, and the due-date bucketing that drives the My Tasks view.
 */

export const TASK_STATUSES = ["open", "in_progress", "awaiting_investor", "completed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  awaiting_investor: "Awaiting investor",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const OPEN_TASK_STATUSES: TaskStatus[] = ["open", "in_progress", "awaiting_investor"];

export class InvalidTaskTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`A task cannot move from ${from} to ${to}.`);
    this.name = "InvalidTaskTransitionError";
  }
}

/**
 * `completed` and `cancelled` are terminal. Reopening a completed task would
 * erase the completion record, so it is refused rather than silently allowed.
 */
const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ["in_progress", "awaiting_investor", "completed", "cancelled"],
  in_progress: ["open", "awaiting_investor", "completed", "cancelled"],
  awaiting_investor: ["open", "in_progress", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

export function isTaskClosed(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

export function canTaskTransition(from: string, to: string): boolean {
  if (!isTaskStatus(from) || !isTaskStatus(to)) return false;
  if (from === to) return true;
  return transitions[from].includes(to);
}

export function assertTaskTransition(from: string, to: string): void {
  if (!canTaskTransition(from, to)) throw new InvalidTaskTransitionError(from, to);
}

export function availableTaskStatuses(from: string): TaskStatus[] {
  return isTaskStatus(from) ? [...transitions[from]] : [];
}

/** Quick-create templates for the follow-ups a servicing desk actually raises. */
export const TASK_TEMPLATES = [
  { type: "call_investor", title: "Call investor" },
  { type: "request_document", title: "Request document" },
  { type: "review_kyc", title: "Review KYC" },
  { type: "follow_up_deposit", title: "Follow up on deposit" },
  { type: "follow_up_withdrawal", title: "Follow up on withdrawal" },
  { type: "explain_rejected_order", title: "Explain rejected order" },
  { type: "review_inactive_account", title: "Review inactive account" },
  { type: "resolve_complaint", title: "Resolve complaint" },
  { type: "portfolio_review", title: "Schedule portfolio review" },
  { type: "follow_up", title: "General follow-up" },
] as const;

export type TaskTemplateType = (typeof TASK_TEMPLATES)[number]["type"];

export function isTaskType(value: unknown): value is TaskTemplateType {
  return typeof value === "string" && TASK_TEMPLATES.some((template) => template.type === value);
}

export type TaskBucket = "overdue" | "today" | "upcoming" | "no_due_date" | "completed";

const dayKey = (value: Date | string) => (typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10));

/**
 * Buckets a task for the My Tasks view. Comparison is by calendar day in ISO
 * form so a task due today never reads as overdue because of clock time.
 */
export function taskBucket(
  task: { status: string; dueDate?: Date | string | null },
  today: Date | string = new Date(),
): TaskBucket {
  if (isTaskClosed(task.status)) return "completed";
  if (!task.dueDate) return "no_due_date";
  const due = dayKey(task.dueDate);
  const now = dayKey(today);
  if (due < now) return "overdue";
  if (due === now) return "today";
  return "upcoming";
}

export function isTaskOverdue(task: { status: string; dueDate?: Date | string | null }, today: Date | string = new Date()): boolean {
  return taskBucket(task, today) === "overdue";
}

export function summariseTasks<T extends { status: string; dueDate?: Date | string | null }>(tasks: T[], today: Date | string = new Date()) {
  const counts: Record<TaskBucket, number> = { overdue: 0, today: 0, upcoming: 0, no_due_date: 0, completed: 0 };
  for (const task of tasks) counts[taskBucket(task, today)] += 1;
  return counts;
}

function reject(message: string): never {
  throw new Response(message, { status: 400 });
}

export function parseTaskTitle(value: unknown): string {
  const title = String(value ?? "").trim();
  if (title.length < 3 || title.length > 160) reject("A task title between 3 and 160 characters is required.");
  return title;
}

export function parseTaskDescription(value: unknown): string | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const description = String(value).trim();
  if (description.length > 2000) reject("A task description must be 2000 characters or fewer.");
  return description;
}

/** Accepts a calendar date only; times are meaningless for a due date. */
export function parseDueDate(value: unknown): Date | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) reject("A due date must be an ISO calendar date (YYYY-MM-DD).");
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  // JavaScript rolls impossible dates forward (30 February becomes 2 March), so
  // compare the round-trip rather than trusting the parse to fail.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    reject("That due date is not a real date.");
  }
  return parsed;
}

export function parseCompletionNote(value: unknown): string | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const note = String(value).trim();
  if (note.length > 1000) reject("A completion note must be 1000 characters or fewer.");
  return note;
}
