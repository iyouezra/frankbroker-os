import test from "node:test";
import assert from "node:assert/strict";

import {
  TASK_STATUSES,
  TASK_TEMPLATES,
  assertTaskTransition,
  availableTaskStatuses,
  canTaskTransition,
  isTaskClosed,
  isTaskOverdue,
  parseCompletionNote,
  parseDueDate,
  parseTaskDescription,
  parseTaskTitle,
  summariseTasks,
  taskBucket,
} from "../lib/crm/tasks.ts";
import {
  CASE_SEVERITIES,
  CASE_STATUSES,
  RESOLUTION_DAYS,
  assertCaseTransition,
  availableCaseStatuses,
  canCaseTransition,
  isCaseOpen,
  isCaseOverdue,
  parseCaseCategory,
  parseFindings,
  parseResolutionSummary,
  parseSeverity,
  severityTone,
  targetResolutionDate,
} from "../lib/crm/cases.ts";

/* ---------------------------------------------------------------- tasks --- */

test("completed and cancelled tasks are terminal", () => {
  for (const terminal of ["completed", "cancelled"]) {
    assert.deepEqual(availableTaskStatuses(terminal), []);
    for (const target of TASK_STATUSES.filter((status) => status !== terminal)) {
      assert.equal(canTaskTransition(terminal, target), false, `${terminal} → ${target} must be refused`);
    }
    // Re-applying the status a task already has is a no-op, not an error, so a
    // retried request cannot fail just because the first one succeeded.
    assert.equal(canTaskTransition(terminal, terminal), true);
    assert.throws(() => assertTaskTransition(terminal, "open"), /cannot move from/);
  }
});

test("open tasks can progress, pause, complete, or be cancelled", () => {
  assert.deepEqual(availableTaskStatuses("open").sort(), ["awaiting_investor", "cancelled", "completed", "in_progress"]);
  assert.equal(canTaskTransition("in_progress", "awaiting_investor"), true);
  assert.equal(canTaskTransition("awaiting_investor", "in_progress"), true);
  assert.equal(canTaskTransition("open", "open"), true);
});

test("an unknown status is never transitionable", () => {
  assert.equal(canTaskTransition("banana", "open"), false);
  assert.equal(canTaskTransition("open", "banana"), false);
});

test("task buckets compare calendar days, not clock time", () => {
  const today = "2026-07-25T23:50:00.000Z";
  assert.equal(taskBucket({ status: "open", dueDate: "2026-07-25T00:00:00.000Z" }, today), "today");
  assert.equal(taskBucket({ status: "open", dueDate: "2026-07-24T00:00:00.000Z" }, today), "overdue");
  assert.equal(taskBucket({ status: "open", dueDate: "2026-07-26T00:00:00.000Z" }, today), "upcoming");
  assert.equal(taskBucket({ status: "open", dueDate: null }, today), "no_due_date");
});

test("a closed task is never overdue, however old its due date", () => {
  const ancient = { dueDate: "2020-01-01T00:00:00.000Z" };
  assert.equal(isTaskOverdue({ ...ancient, status: "open" }, "2026-07-25"), true);
  assert.equal(isTaskOverdue({ ...ancient, status: "completed" }, "2026-07-25"), false);
  assert.equal(isTaskOverdue({ ...ancient, status: "cancelled" }, "2026-07-25"), false);
  assert.equal(taskBucket({ ...ancient, status: "completed" }, "2026-07-25"), "completed");
});

test("summariseTasks counts every task exactly once", () => {
  const tasks = [
    { status: "open", dueDate: "2026-07-24" },
    { status: "in_progress", dueDate: "2026-07-25" },
    { status: "awaiting_investor", dueDate: "2026-08-01" },
    { status: "open", dueDate: null },
    { status: "completed", dueDate: "2026-07-01" },
    { status: "cancelled", dueDate: null },
  ];
  const counts = summariseTasks(tasks, "2026-07-25");
  assert.deepEqual(counts, { overdue: 1, today: 1, upcoming: 1, no_due_date: 1, completed: 2 });
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), tasks.length);
});

test("task templates are unique and all closed states agree", () => {
  const types = TASK_TEMPLATES.map((template) => template.type);
  assert.equal(new Set(types).size, types.length);
  assert.equal(isTaskClosed("completed"), true);
  assert.equal(isTaskClosed("cancelled"), true);
  assert.equal(isTaskClosed("awaiting_investor"), false);
});

test("task input parsing rejects junk and trims what it keeps", () => {
  assert.equal(parseTaskTitle("  Call investor  "), "Call investor");
  assert.throws(() => parseTaskTitle("hi"), (error) => error instanceof Response && error.status === 400);
  assert.throws(() => parseTaskTitle("x".repeat(161)), (error) => error instanceof Response);
  assert.equal(parseTaskDescription("   "), null);
  assert.throws(() => parseTaskDescription("x".repeat(2001)), (error) => error instanceof Response);
  assert.equal(parseCompletionNote(""), null);
  assert.throws(() => parseCompletionNote("x".repeat(1001)), (error) => error instanceof Response);
});

test("due dates accept a calendar date only, at UTC midnight", () => {
  assert.equal(parseDueDate("2026-07-25").toISOString(), "2026-07-25T00:00:00.000Z");
  assert.equal(parseDueDate(null), null);
  assert.throws(() => parseDueDate("2026-07-25T10:00:00Z"), (error) => error instanceof Response);
  assert.throws(() => parseDueDate("25/07/2026"), (error) => error instanceof Response);
  assert.throws(() => parseDueDate("2026-02-30"), (error) => error instanceof Response);
});

/* ---------------------------------------------------------------- cases --- */

test("closed is the only terminal case status", () => {
  assert.deepEqual(availableCaseStatuses("closed"), []);
  for (const target of CASE_STATUSES.filter((status) => status !== "closed")) {
    assert.equal(canCaseTransition("closed", target), false);
  }
  assert.equal(canCaseTransition("closed", "closed"), true);
  assert.throws(() => assertCaseTransition("closed", "new"), /cannot move from/);
  // A resolved case can still be reopened or formally closed.
  assert.ok(availableCaseStatuses("resolved").length > 0);
});

test("case severity sets the target resolution date", () => {
  const openedAt = new Date("2026-07-25T00:00:00.000Z");
  for (const severity of CASE_SEVERITIES) {
    const target = targetResolutionDate(severity, openedAt);
    const days = (target.getTime() - openedAt.getTime()) / 86_400_000;
    assert.equal(days, RESOLUTION_DAYS[severity]);
  }
  // A severity we do not recognise falls back to medium rather than never being due.
  assert.equal(targetResolutionDate("banana", openedAt).getTime(), targetResolutionDate("medium", openedAt).getTime());
});

test("a case is overdue only while it is still open", () => {
  const past = "2026-07-01T00:00:00.000Z";
  const now = new Date("2026-07-25T00:00:00.000Z");
  assert.equal(isCaseOverdue({ status: "under_review", targetResolutionAt: past }, now), true);
  assert.equal(isCaseOverdue({ status: "resolved", targetResolutionAt: past }, now), false);
  assert.equal(isCaseOverdue({ status: "closed", targetResolutionAt: past }, now), false);
  assert.equal(isCaseOverdue({ status: "under_review", targetResolutionAt: null }, now), false);
  assert.equal(isCaseOpen("closed"), false);
});

test("severity tone maps to existing status classes", () => {
  assert.equal(severityTone("critical"), "danger");
  assert.equal(severityTone("high"), "warning");
  assert.equal(severityTone("medium"), "brand");
  assert.equal(severityTone("low"), "neutral");
});

test("resolving a case demands a written outcome", () => {
  assert.throws(() => parseResolutionSummary(""), (error) => error instanceof Response && error.status === 400);
  assert.throws(() => parseResolutionSummary("too short"), (error) => error instanceof Response);
  assert.equal(parseResolutionSummary("  Refunded the fee difference and called the investor.  "), "Refunded the fee difference and called the investor.");
  assert.throws(() => parseResolutionSummary("x".repeat(4001)), (error) => error instanceof Response);
});

test("case severity and category parsing reject unknown values", () => {
  assert.equal(parseSeverity(undefined), "medium");
  assert.equal(parseSeverity("critical"), "critical");
  assert.throws(() => parseSeverity("catastrophic"), (error) => error instanceof Response);
  assert.equal(parseCaseCategory(""), "complaint");
  assert.throws(() => parseCaseCategory("sales_lead"), (error) => error instanceof Response);
  assert.equal(parseFindings("   "), null);
  assert.throws(() => parseFindings("x".repeat(4001)), (error) => error instanceof Response);
});
