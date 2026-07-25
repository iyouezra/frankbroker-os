import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidThreadTransitionError,
  THREAD_STATUSES,
  assertThreadOpenForMessage,
  assertThreadTransition,
  availableThreadStatuses,
  canThreadTransition,
  isThreadClosed,
  statusAfterMessage,
} from "../lib/crm/status.ts";
import {
  categoryForServiceRequest,
  isRelatedType,
  parseBody,
  parsePriority,
  parseRelated,
  parseSubject,
  priorityTone,
} from "../lib/crm/categories.ts";
import { MAX_ATTACHMENTS_PER_MESSAGE, prepareAttachment, prepareAttachments, sanitizeAttachmentName } from "../lib/crm/attachments.ts";

const thrown = (fn) => {
  try { return fn(), null; } catch (error) { return error; }
};

test("a closed conversation is terminal and accepts no further messages", () => {
  assert.equal(isThreadClosed("closed"), true);
  assert.deepEqual(availableThreadStatuses("closed"), []);
  for (const status of THREAD_STATUSES) {
    if (status === "closed") continue;
    assert.equal(canThreadTransition("closed", status), false, `closed must not reopen to ${status}`);
  }
  const error = thrown(() => assertThreadOpenForMessage("closed"));
  assert.ok(error instanceof Response);
  assert.equal(error.status, 409);
  assert.doesNotThrow(() => assertThreadOpenForMessage("resolved"));
});

test("an investor reply reopens a resolved conversation and hands it to the broker", () => {
  assert.equal(canThreadTransition("resolved", "open"), true);
  assert.equal(statusAfterMessage("resolved", "investor"), "pending_broker");
  assert.equal(statusAfterMessage("pending_client", "investor"), "pending_broker");
  assert.equal(statusAfterMessage("open", "broker"), "pending_client");
});

test("an internal note never changes the conversation status", () => {
  for (const status of THREAD_STATUSES) {
    assert.equal(statusAfterMessage(status, "system"), status, `${status} must survive an internal note`);
  }
});

test("invalid transitions raise a typed error the API maps to 409", () => {
  const error = thrown(() => assertThreadTransition("closed", "open"));
  assert.ok(error instanceof InvalidThreadTransitionError);
  assert.equal(error.name, "InvalidThreadTransitionError");
  assert.doesNotThrow(() => assertThreadTransition("open", "resolved"));
  assert.doesNotThrow(() => assertThreadTransition("open", "open"));
});

test("subject, body, priority and related links are validated before storage", () => {
  assert.equal(parseSubject("  Order query  "), "Order query");
  assert.equal(thrown(() => parseSubject("hi")).status, 400);
  assert.equal(thrown(() => parseSubject("x".repeat(161))).status, 400);
  assert.equal(thrown(() => parseBody("")).status, 400);
  assert.equal(parsePriority(undefined), "normal");
  assert.equal(thrown(() => parsePriority("emergency")).status, 400);

  assert.deepEqual(parseRelated(undefined, undefined), { relatedType: null, relatedId: null });
  assert.deepEqual(parseRelated("order", "ORD-1"), { relatedType: "order", relatedId: "ORD-1" });
  assert.equal(thrown(() => parseRelated("order", "")).status, 400, "a half-specified link is rejected");
  assert.equal(thrown(() => parseRelated("users", "cli_1")).status, 400, "arbitrary tables cannot be linked");
  assert.equal(isRelatedType("service_request"), true);
  assert.equal(isRelatedType("password"), false);
});

test("service requests map to a conversation category and priorities map to existing status tones", () => {
  assert.equal(categoryForServiceRequest("trade_discrepancy"), "order");
  assert.equal(categoryForServiceRequest("account_closure"), "general");
  assert.equal(categoryForServiceRequest("anything_else"), "other");
  assert.equal(priorityTone("urgent"), "danger");
  assert.equal(priorityTone("high"), "warning");
  assert.equal(priorityTone("low"), "neutral");
});

test("attachments enforce type, signature, size and count", async () => {
  const pdf = new File([Buffer.from("%PDF-1.4\n%%EOF")], "statement.pdf", { type: "application/pdf" });
  const prepared = await prepareAttachment(pdf);
  assert.equal(prepared.originalName, "statement.pdf");
  assert.equal(prepared.mimeType, "application/pdf");

  const wrongSignature = new File([Buffer.from("not really a pdf")], "fake.pdf", { type: "application/pdf" });
  await assert.rejects(() => prepareAttachment(wrongSignature), (error) => error instanceof Response && error.status === 400);

  const unsupported = new File([Buffer.from("<script>")], "payload.html", { type: "text/html" });
  await assert.rejects(() => prepareAttachment(unsupported), (error) => error instanceof Response && error.status === 400);

  const empty = new File([], "empty.pdf", { type: "application/pdf" });
  await assert.rejects(() => prepareAttachment(empty), (error) => error instanceof Response && error.status === 400);
});

test("too many attachments are rejected and filenames cannot inject headers", async () => {
  const formData = new FormData();
  for (let index = 0; index < MAX_ATTACHMENTS_PER_MESSAGE + 1; index += 1) {
    formData.set(`attachment${index}`, new File([Buffer.from("%PDF-1.4\n%%EOF")], `file${index}.pdf`, { type: "application/pdf" }));
  }
  await assert.rejects(() => prepareAttachments(formData), (error) => error instanceof Response && error.status === 400);

  assert.equal(sanitizeAttachmentName('bad"\r\nname.pdf'), "bad___name.pdf");
  assert.equal(sanitizeAttachmentName(""), "attachment");
});
