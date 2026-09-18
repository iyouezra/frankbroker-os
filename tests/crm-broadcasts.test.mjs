import assert from "node:assert/strict";
import test from "node:test";
import { parseBroadcastInput, parseReadMessageIds, messageReceipt } from "../lib/crm/broadcasts.ts";
import { serializeMessage } from "../lib/crm/visibility.ts";
import { CRM_PERMISSIONS, hasPermission } from "../lib/frank.ts";
const input = { subject: "Issuer update", body: "An update for our clients.", segment: "all", channel: "in_app" };
const rejects = (fn) => { try { fn(); assert.fail("Expected rejection"); } catch (error) { assert.equal(error.status, 400); } };

test("broadcasts reject unconnected channels and malformed audiences", () => {
  for (const channel of ["email", "sms", "whatsapp", undefined]) rejects(() => parseBroadcastInput({ ...input, channel }));
  for (const segment of ["constructor", "unknown", "holders", "event_entitlements"]) rejects(() => parseBroadcastInput({ ...input, segment }));
  rejects(() => parseBroadcastInput({ ...input, corporateActionId: "event", eventName: "Another event" }));
  rejects(() => parseBroadcastInput({ ...input, body: { unexpected: true } }));
  assert.equal(parseBroadcastInput({ ...input, segment: "holders", instrumentId: "company" }).instrumentId, "company");
});

test("read acknowledgements must identify displayed messages and cannot be unbounded", () => {
  assert.deepEqual(parseReadMessageIds(["a", "a", "b"]), ["a", "b"]);
  for (const ids of [undefined, "all", [42], [""], Array(101).fill("a")]) rejects(() => parseReadMessageIds(ids));
});

test("receipt states follow evidence and do not fabricate historical delivery", () => {
  assert.equal(messageReceipt({}), "sent");
  assert.equal(messageReceipt({ deliveredAt: "2026-09-17" }), "delivered");
  assert.equal(messageReceipt({ readAt: "2026-09-17" }), "read");
  const message = { id: "a", body: "Note", visibility: "internal", authorType: "system", createdAt: "2026-09-17", deliveredAt: "2026-09-17", readAt: "2026-09-17" };
  assert.equal("deliveryStatus" in serializeMessage("broker", message), false);
  assert.equal("readAt" in serializeMessage("broker", message), false);
});

test("bulk sending is reserved for client communication roles", () => {
  for (const role of ["broker_admin", "service_officer", "relationship_officer"]) assert.equal(hasPermission(role, CRM_PERMISSIONS.broadcastSend), true);
  for (const role of ["management", "finance", "compliance", "trader"]) assert.equal(hasPermission(role, CRM_PERMISSIONS.broadcastSend), false);
});
