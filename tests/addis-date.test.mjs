import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  addisBusinessDate,
  addisDateOnly,
  addisDayStart,
  addisGreeting,
  addisYear,
  formatAddisBusinessDate,
  formatAddisBusinessTime,
  formatAddisDashboardDate,
  shiftDateKey,
} from "../lib/addis-date.ts";
import { computeBrokerAnalytics } from "../lib/broker-analytics.ts";
import { taskBucket } from "../lib/crm/tasks.ts";

test("the business date rolls over at midnight in Addis Ababa", () => {
  assert.equal(addisBusinessDate(new Date("2026-08-13T20:59:59.999Z")), "2026-08-13");
  assert.equal(addisBusinessDate(new Date("2026-08-13T21:00:00.000Z")), "2026-08-14");
  assert.equal(addisDayStart(new Date("2026-08-14T12:00:00.000Z")).toISOString(), "2026-08-13T21:00:00.000Z");
  assert.equal(addisDateOnly(new Date("2026-08-13T21:00:00.000Z")).toISOString(), "2026-08-14T00:00:00.000Z");
  assert.equal(addisYear(new Date("2026-12-31T21:00:00.000Z")), 2027);
});

test("business-date labels and greetings use Addis local time", () => {
  const friday = new Date("2026-08-14T10:00:00.000Z");
  assert.equal(formatAddisDashboardDate(friday), "FRIDAY · 14 AUGUST 2026");
  assert.equal(formatAddisBusinessDate(friday), "14 AUG 2026");
  assert.equal(formatAddisBusinessTime(friday), "13:00:00");
  assert.equal(addisGreeting(new Date("2026-08-14T05:00:00.000Z")), "Good morning");
  assert.equal(addisGreeting(new Date("2026-08-14T11:00:00.000Z")), "Good afternoon");
  assert.equal(addisGreeting(new Date("2026-08-14T17:00:00.000Z")), "Good evening");
  assert.equal(shiftDateKey("2026-12-31", 1), "2027-01-01");
});

test("date-dependent analytics and task buckets follow the Addis date", () => {
  const midnightInAddis = new Date("2026-08-13T21:00:00.000Z");
  assert.equal(computeBrokerAnalytics([], [], "today", midnightInAddis).trend.at(-1)?.date, "2026-08-14");
  assert.equal(taskBucket({ status: "open", dueDate: "2026-08-14" }, midnightInAddis), "today");
});

test("the live broker shell no longer contains the July demonstration business date", async () => {
  const root = new URL("../", import.meta.url);
  const [shell, dashboard, analytics] = await Promise.all([
    readFile(new URL("app/frankbroker-app.tsx", root), "utf8"),
    readFile(new URL("features/broker/dashboard/dashboard-screen.tsx", root), "utf8"),
    readFile(new URL("lib/broker-analytics.ts", root), "utf8"),
  ]);
  assert.doesNotMatch(shell, /Business date 14 JUL 2026|tradeDate: "2026-07-14"/);
  assert.doesNotMatch(dashboard, /TUESDAY · 14 JULY 2026/);
  assert.doesNotMatch(analytics, /BUSINESS_DATE\s*=/);
});
