import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readBrokerFrontend } from "./frontend-source.mjs";

import {
  csvCell,
  movementDescription,
  ORDER_STATUS_GROUPS,
  orderResponsibility,
  waitingTime,
} from "../lib/order-log.ts";

test("order status groups match the operational filters", () => {
  assert.deepEqual(ORDER_STATUS_GROUPS.review, ["pending_broker_review"]);
  assert.ok(ORDER_STATUS_GROUPS.executed.includes("partially_filled"));
  assert.ok(ORDER_STATUS_GROUPS.exceptions.includes("validation_failed"));
  assert.ok(ORDER_STATUS_GROUPS.exceptions.includes("cancelled"));
});

test("next actions and owners remain plain and status specific", () => {
  assert.deepEqual(orderResponsibility("pending_broker_review"), {
    nextAction: "Approve or reject the instruction",
    actionOwner: "Authorized approver",
  });
  assert.deepEqual(orderResponsibility("approved", "Mekdes Tadesse"), {
    nextAction: "Capture the execution",
    actionOwner: "Mekdes Tadesse",
  });
  assert.equal(orderResponsibility("settlement_pending").actionOwner, "Settlement team");
  assert.equal(orderResponsibility("settled").nextAction, "No further action");
});

test("waiting time is informational without an SLA threshold", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  assert.equal(waitingTime("2026-07-25T11:18:00Z", now), "Waiting 42 min");
  assert.equal(waitingTime("2026-07-25T09:35:00Z", now), "Waiting 2h 25m");
  assert.equal(waitingTime("2026-07-23T10:00:00Z", now), "Waiting 2d 2h");
});

test("cash and holdings movements use plain descriptions", () => {
  assert.equal(movementDescription("cash", "block"), "Cash reserved for this order");
  assert.equal(movementDescription("securities", "release"), "Unused holdings released");
  assert.equal(movementDescription("cash", "trade_debit"), "Cash used for a purchase");
  assert.equal(movementDescription("securities", "buy_credit"), "Purchased holdings added");
});

test("CSV cells escape external references safely", () => {
  assert.equal(csvCell('ESX-"1048"'), '"ESX-""1048"""');
});

test("order APIs expose paginated summaries, tenant-scoped detail, and filtered export", async () => {
  const listRoute = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  const detailRoute = await readFile(new URL("../app/api/orders/[id]/route.ts", import.meta.url), "utf8");
  for (const field of ["query", "status", "side", "risk", "orderType", "source", "period", "sort", "page", "pageSize"]) {
    assert.match(listRoute, new RegExp(`searchParams\\.get\\(\"${field}\"\\)`));
  }
  assert.match(listRoute, /format"\) === "csv"/);
  assert.match(listRoute, /captureReference/);
  assert.match(listRoute, /accountNumber/);
  assert.match(detailRoute, /brokerId: actor\.brokerId/);
  assert.match(detailRoute, /validations:/);
  assert.match(detailRoute, /validation\.result === "passed"/);
  assert.doesNotMatch(detailRoute, /validation\.result === "pass"/);
  assert.match(detailRoute, /captureReference: trade\.captureReference/);
  assert.match(detailRoute, /ledgerEntries:/);
});

test("broker UI uses operational labels and requires an execution reference", async () => {
  const app = await readBrokerFrontend();
  assert.match(app, />Executions</);
  assert.match(app, /An order may be completed through one or more executions/);
  assert.match(app, />Technical details</);
  assert.match(app, /Cash and holdings movements/);
  assert.match(app, /<th>Source<\/th>/);
  assert.match(app, /displayLabel\(order\.source\)/);
  assert.match(app, /Execution reference<input required/);
  assert.match(app, /No executions yet\. This order has not been filled\./);
  assert.doesNotMatch(app, />Related trades</);
  assert.doesNotMatch(app, />Order ledger entries</);
});
