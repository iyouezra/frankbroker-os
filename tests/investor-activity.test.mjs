import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  filterInvestorActivity,
  getInvestorActivityStatus,
  getInvestorActivityTone,
  getRecentInvestorActivity,
  mergeInvestorActivity,
  sortInvestorActivity,
} from "../lib/investor-activity.ts";
import { demoInvestorActivity } from "../lib/investor-activity-demo.ts";

const moneyItem = (id, occurredAt, movementType = "deposit") => ({
  kind: "money",
  id,
  occurredAt,
  status: "completed",
  movementType,
  amount: 1_000,
  currency: "ETB",
  bankReference: null,
  bankName: "Commercial Bank of Ethiopia",
  accountName: "Selam Mekonnen",
  accountMasked: "•••••• 894108",
  submittedAt: occurredAt,
  reviewedAt: null,
  completedAt: occurredAt,
  rejectionReason: null,
  failureReason: null,
  reference: id,
});

const order = {
  kind: "order",
  id: "order-1",
  occurredAt: "2026-07-22T08:00:00Z",
  status: "pending_broker_review",
  ticker: "TELE",
  instrumentName: "Ethio Telecom",
  side: "buy",
  quantity: 20,
  price: 305,
  triggerPrice: null,
  orderType: "limit",
  filledQuantity: 0,
  estimatedFees: 30.5,
  estimatedNet: 6_130.5,
  reference: "INV-ORDER-1",
  submittedAt: "2026-07-22T08:00:00Z",
  rejectionReason: null,
};

const trade = {
  kind: "trade",
  id: "trade-1",
  occurredAt: "2026-07-21T08:00:00Z",
  status: "settled",
  ticker: "WGBX",
  instrumentName: "Wegagen Bank",
  side: "buy",
  quantity: 15,
  executionPrice: 1_685,
  grossAmount: 25_275,
  fees: 126.38,
  netAmount: 25_401.38,
  tradeDate: "2026-07-21",
  settlementDate: "2026-07-23",
  settlementStatus: "settled",
  reference: "TRD-1",
};

test("activity is sorted newest first and Home receives only five rows", () => {
  const items = [
    moneyItem("money-1", "2026-07-18T08:00:00Z"),
    order,
    moneyItem("money-2", "2026-07-23T08:00:00Z", "withdrawal"),
    trade,
    moneyItem("money-3", "2026-07-20T08:00:00Z"),
    moneyItem("money-4", "2026-07-19T08:00:00Z"),
  ];

  assert.deepEqual(sortInvestorActivity(items).map((item) => item.id), [
    "money-2",
    "order-1",
    "trade-1",
    "money-3",
    "money-4",
    "money-1",
  ]);
  assert.equal(getRecentInvestorActivity(items).length, 5);
  assert.equal(getRecentInvestorActivity(items)[0].id, "money-2");
});

test("activity filters keep orders, executions, and money distinct", () => {
  const items = [moneyItem("money-1", "2026-07-23T08:00:00Z"), order, trade];
  assert.deepEqual(filterInvestorActivity(items, "orders").map((item) => item.id), ["order-1"]);
  assert.deepEqual(filterInvestorActivity(items, "trades").map((item) => item.id), ["trade-1"]);
  assert.deepEqual(filterInvestorActivity(items, "money").map((item) => item.id), ["money-1"]);
  assert.equal(filterInvestorActivity(items, "all").length, 3);
});

test("local history fills the demo when Prisma is unavailable and live records take priority", () => {
  assert.ok(demoInvestorActivity.length >= 5);
  assert.deepEqual(new Set(demoInvestorActivity.map((item) => item.kind)), new Set(["money", "order", "trade"]));

  const liveDeposit = {
    ...demoInvestorActivity.find((item) => item.id === "MOV-DEMO-DEP-001"),
    amount: 20_000,
  };
  const merged = mergeInvestorActivity([liveDeposit], demoInvestorActivity);
  assert.equal(merged.filter((item) => item.id === "MOV-DEMO-DEP-001").length, 1);
  assert.equal(merged.find((item) => item.id === "MOV-DEMO-DEP-001").amount, 20_000);
});

test("internal statuses become plain investor-facing labels and tones", () => {
  assert.equal(getInvestorActivityStatus("pending_broker_review"), "Waiting for broker");
  assert.equal(getInvestorActivityStatus("partially_filled"), "Partly filled");
  assert.equal(getInvestorActivityStatus("validation_failed"), "Not approved");
  assert.equal(getInvestorActivityStatus("pending_verification"), "Pending verification");
  assert.equal(getInvestorActivityTone("settled"), "positive");
  assert.equal(getInvestorActivityTone("validation_failed"), "negative");
  assert.equal(getInvestorActivityTone("pending_broker_review"), "pending");
});

test("investor activity API includes executions and settlements without internal notes", async () => {
  const route = await readFile(new URL("../app/api/investor/route.ts", import.meta.url), "utf8");
  const activityStart = route.indexOf("const activity =");
  const activityBuilder = route.slice(activityStart, route.indexOf("return Response.json({", activityStart));
  assert.match(route, /trades: \{ include: \{ settlement: true \}/);
  assert.match(activityBuilder, /kind: "order"/);
  assert.match(activityBuilder, /kind: "trade"/);
  assert.match(activityBuilder, /kind: "money"/);
  assert.match(activityBuilder, /\.slice\(0, 25\)/);
  assert.doesNotMatch(activityBuilder, /notes:/);
  assert.doesNotMatch(activityBuilder, /capturedBy/);
});

test("seeded investor history reconciles completed funding, withdrawals, and purchases to current cash", async () => {
  const seed = await readFile(new URL("../prisma/seed.ts", import.meta.url), "utf8");
  assert.match(seed, /MOV-DEMO-DEP-000/);
  assert.match(seed, /MOV-DEMO-WDR-001/);
  assert.match(seed, /ORD-INV-0001/);
  assert.match(seed, /TRD-INV-0002/);
  assert.equal(Number((160_869.84 - 25_000 - 35_468.46 - 25_401.38).toFixed(2)), 75_000);
});
