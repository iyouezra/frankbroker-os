import test from "node:test";
import assert from "node:assert/strict";

import {
  TIMELINE_FILTERS,
  buildClientTimeline,
  filterTimeline,
  timelineCounts,
} from "../lib/crm/timeline.ts";

const sample = () => ({
  threads: [
    { id: "THR-1", subject: "Why was my order held?", category: "order", status: "open", statusLabel: "Open", lastMessageAt: "2026-07-24T09:12:00.000Z", createdAt: "2026-07-24T08:40:00.000Z", lastMessagePreview: "Can you check?", assignedToName: "Kalkidan Alemu" },
    { id: "THR-2", subject: "Wrong fee on my note", category: "complaint", status: "open", lastMessageAt: "2026-07-22T07:30:00.000Z", createdAt: "2026-07-22T07:30:00.000Z", lastMessagePreview: null },
  ],
  tasks: [
    { id: "TSK-1", title: "Call investor", status: "open", dueDate: "2026-07-26", createdAt: "2026-07-23T09:00:00.000Z", assignedToName: "Bethel Tesfaye" },
    { id: "TSK-2", title: "Portfolio review", status: "completed", createdAt: "2026-07-18T11:00:00.000Z", completedAt: "2026-07-20T16:45:00.000Z", completionNote: "Reviewed on a call." },
  ],
  cases: [{ id: "CASE-1", subject: "Wrong fee", status: "under_review", severity: "high", openedAt: "2026-07-22T07:45:00.000Z" }],
  orders: [{ id: "ORD-1", symbol: "TELE", side: "buy", status: "filled", createdAt: "2026-07-19T10:00:00.000Z", quantity: 100 }],
  transactions: [{ id: "TXN-1", type: "deposit", amount: 5000, valueDate: "2026-07-17T10:00:00.000Z", reference: "DEP-1" }],
  documents: [{ id: "DOC-1", documentType: "proof_of_address", status: "approved", uploadedAt: "2026-07-15T10:00:00.000Z" }],
  notes: [{ id: "NOTE-1", text: "Client prefers a call before 10am.", category: "general", createdAt: "2026-07-14T10:00:00.000Z", createdBy: "Bethel Tesfaye" }],
  auditTrail: [
    { id: "AUD-1", action: "CLIENT_APPROVED", summary: "Onboarding approved.", createdAt: "2026-07-13T10:00:00.000Z", actor: "Liya Girma", entityType: "client", entityId: "cli_1" },
    { id: "AUD-2", action: "ORDER_PLACED", summary: "Order placed.", createdAt: "2026-07-19T10:00:00.000Z", actor: "Dawit Alemu", entityType: "order", entityId: "ORD-1" },
  ],
});

test("the timeline merges every source into one newest-first list", () => {
  const events = buildClientTimeline(sample());
  const times = events.map((event) => event.at);
  assert.deepEqual(times, [...times].sort().reverse());
  assert.equal(events[0].link.id, "THR-1");
  // Threads, tasks, case, order, transaction, document, note, and one audit row.
  assert.ok(events.length >= 9);
});

test("an audit row already represented by an order is not repeated", () => {
  const events = buildClientTimeline(sample());
  const orderEvents = events.filter((event) => event.link?.type === "order" && event.link.id === "ORD-1");
  assert.equal(orderEvents.length, 1);
  assert.equal(events.some((event) => event.title === "Order placed"), false);
  // The unrelated audit row still comes through.
  assert.equal(events.some((event) => event.detail === "Onboarding approved."), true);
});

test("every event carries a stable unique id", () => {
  const events = buildClientTimeline(sample());
  const ids = events.map((event) => event.id);
  assert.equal(new Set(ids).size, ids.length);
  // Rebuilding the same input produces the same ids, so React keys stay stable.
  assert.deepEqual(buildClientTimeline(sample()).map((event) => event.id), ids);
});

test("a completed task is dated by its completion, not its creation", () => {
  const events = buildClientTimeline(sample());
  const completed = events.find((event) => event.link?.id === "TSK-2");
  assert.equal(completed.at, "2026-07-20T16:45:00.000Z");
  assert.equal(completed.tone, "success");
  assert.equal(completed.detail, "Reviewed on a call.");
});

test("a complaint thread is toned as a warning", () => {
  const events = buildClientTimeline(sample());
  assert.equal(events.find((event) => event.link?.id === "THR-2").tone, "warning");
  assert.equal(events.find((event) => event.link?.id === "THR-1").tone, "info");
});

test("filter counts partition the timeline exactly", () => {
  const events = buildClientTimeline(sample());
  const counts = timelineCounts(events);
  assert.equal(counts.all, events.length);
  const groups = TIMELINE_FILTERS.filter((filter) => filter !== "all");
  assert.equal(groups.reduce((total, group) => total + counts[group], 0), events.length);
  for (const group of groups) {
    assert.equal(filterTimeline(events, group).length, counts[group]);
  }
  assert.equal(filterTimeline(events, "all").length, events.length);
});

test("an empty client produces an empty timeline rather than throwing", () => {
  assert.deepEqual(buildClientTimeline({}), []);
  const counts = timelineCounts([]);
  assert.equal(counts.all, 0);
  for (const filter of TIMELINE_FILTERS) assert.equal(typeof counts[filter], "number");
});

test("internal notes stay on the timeline but never claim a link", () => {
  // The timeline is broker-only. Notes appear, but with no link, so nothing can
  // deep-link an investor surface at a broker-internal record.
  const note = buildClientTimeline(sample()).find((event) => event.kind === "internal_note");
  assert.equal(note.title, "Internal note");
  assert.equal(note.link, undefined);
});
