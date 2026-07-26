import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERNAL,
  SHARED,
  assertNoInvestorNotifyForInternal,
  serializeMessage,
  serializeThreadDetail,
  threadCountersAfterMessage,
  unreadFor,
  visibleAttachmentsFor,
  visibleMessagesFor,
} from "../lib/crm/visibility.ts";

const sharedMessage = {
  id: "MSG-1", visibility: SHARED, authorType: "investor", authorUserId: null,
  body: "Why was my order held?", createdAt: new Date("2026-07-24T08:40:00Z"), attachments: [],
};
const internalMessage = {
  id: "MSG-2", visibility: INTERNAL, authorType: "system", authorUserId: "usr_trader",
  author: { id: "usr_trader", fullName: "Dawit Alemu" },
  body: "SECRET desk guidance - do not amend unilaterally.",
  createdAt: new Date("2026-07-24T08:55:00Z"),
  attachments: [{ id: "ATT-2", originalName: "desk-note.pdf", mimeType: "application/pdf", sizeBytes: 2048, visibility: INTERNAL }],
};

const thread = {
  id: "THR-1", subject: "Order query", category: "order", priority: "high", status: "pending_broker",
  relatedType: "order", relatedId: "ORD-INV-0003", assignedToUserId: "usr_service",
  assignedTo: { id: "usr_service", fullName: "Bethel Tesfaye" },
  client: { id: "cli_investor_demo", clientCode: "CL-INV-001", fullName: "Selam Mekonnen" },
  account: { id: "acc_investor_demo", accountNumber: "INV-00001-01" },
  messageCount: 2, lastMessageAt: new Date("2026-07-24T08:55:00Z"), lastMessagePreview: "Why was my order held?",
  brokerUnreadCount: 2, investorUnreadCount: 0, createdAt: new Date("2026-07-24T08:40:00Z"),
};

test("internal messages and their attachments are filtered out for investors", () => {
  const messages = [sharedMessage, internalMessage];
  assert.equal(visibleMessagesFor("broker", messages).length, 2);
  const investorView = visibleMessagesFor("investor", messages);
  assert.equal(investorView.length, 1);
  assert.equal(investorView[0].id, "MSG-1");
  assert.equal(visibleAttachmentsFor("investor", internalMessage.attachments).length, 0);
  assert.equal(visibleAttachmentsFor("broker", internalMessage.attachments).length, 1);
});

test("serializing an internal message for an investor throws rather than leaking", () => {
  assert.throws(() => serializeMessage("investor", internalMessage), /internal/i);
  assert.doesNotThrow(() => serializeMessage("broker", internalMessage));
});

test("investor serialization omits staff identity and operational metadata", () => {
  const payload = serializeMessage("investor", sharedMessage);
  assert.equal(payload.authorLabel, "You");
  assert.equal(payload.mine, true);
  assert.equal("authorUserId" in payload, false);
  assert.equal("visibility" in payload, false);
  assert.equal("authorName" in payload, false);
});

test("an investor thread payload never contains internal content or assignment data", () => {
  const detail = serializeThreadDetail("investor", thread, [sharedMessage, internalMessage]);
  const raw = JSON.stringify(detail);
  assert.doesNotMatch(raw, /SECRET/);
  assert.doesNotMatch(raw, /Dawit Alemu/);
  assert.doesNotMatch(raw, /assignedTo/);
  assert.doesNotMatch(raw, /usr_/);
  assert.doesNotMatch(raw, /priority/);
  assert.equal(detail.messages.length, 1);
  assert.equal(detail.statusLabel, "Waiting for broker");
});

test("broker thread payload keeps the operational detail the desk needs", () => {
  const detail = serializeThreadDetail("broker", thread, [sharedMessage, internalMessage]);
  assert.equal(detail.messages.length, 2);
  assert.equal(detail.assignedToName, "Bethel Tesfaye");
  assert.equal(detail.priority, "high");
  assert.equal(detail.statusLabel, "Awaiting broker");
});

test("an internal note leaves the investor's unread count and list preview untouched", () => {
  const base = { brokerUnreadCount: 0, investorUnreadCount: 0, messageCount: 4, lastMessagePreview: "earlier reply", lastMessageAt: new Date("2026-07-24T08:00:00Z") };
  const after = threadCountersAfterMessage(base, { visibility: INTERNAL, authorType: "system", body: "SECRET note", createdAt: new Date("2026-07-24T09:00:00Z") });
  assert.equal(after.investorUnreadCount, 0);
  assert.equal(after.lastMessagePreview, "earlier reply");
  assert.equal(after.messageCount, 5);
});

test("shared messages move the unread counter to the other side only", () => {
  const base = { brokerUnreadCount: 3, investorUnreadCount: 1, messageCount: 1, lastMessagePreview: null, lastMessageAt: new Date() };
  const fromBroker = threadCountersAfterMessage(base, { visibility: SHARED, authorType: "broker", body: "Checking now", createdAt: new Date() });
  assert.equal(fromBroker.investorUnreadCount, 2);
  assert.equal(fromBroker.brokerUnreadCount, 0, "answering clears the broker's own unread");
  const fromInvestor = threadCountersAfterMessage(base, { visibility: SHARED, authorType: "investor", body: "Thanks", createdAt: new Date() });
  assert.equal(fromInvestor.brokerUnreadCount, 4);
  assert.equal(fromInvestor.investorUnreadCount, 0);
});

test("unreadFor reads the correct side and internal notify is rejected", () => {
  assert.equal(unreadFor("broker", thread), 2);
  assert.equal(unreadFor("investor", thread), 0);
  assert.throws(() => assertNoInvestorNotifyForInternal(INTERNAL, { scope: "investor" }), /never notify/i);
  assert.doesNotThrow(() => assertNoInvestorNotifyForInternal(INTERNAL, null));
  assert.doesNotThrow(() => assertNoInvestorNotifyForInternal(SHARED, { scope: "investor" }));
});
