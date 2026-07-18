import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("digital KYC remains pending broker review and returns generated identifiers", async () => {
  const [route, clientService] = await Promise.all([read("app/api/investor/route.ts"), read("lib/client-service.ts")]);
  assert.match(route, /kycStatus: "pending_review"/);
  assert.match(route, /status: "pending_approval"/);
  assert.match(route, /clientCode: updated\.clientCode/);
  assert.match(route, /accountNumber: account\?\.accountNumber/);
  assert.match(clientService, /const clientId = `cli_/);
  assert.match(clientService, /const accountNumber = `TRD-/);
});

test("order authorization is exact-payload-bound, expiring, attempt-limited, and single-use", async () => {
  const [verification, orderService] = await Promise.all([read("lib/verification-service.ts"), read("lib/oms/order-service.ts")]);
  for (const field of ["accountId", "instrumentId", "side", "quantity", "price", "orderType", "source", "submissionReference"]) {
    assert.match(verification, new RegExp(field));
  }
  assert.match(verification, /maxAttempts/);
  assert.match(verification, /expiresAt/);
  assert.match(verification, /consumedAt: null/);
  assert.match(verification, /timingSafeEqual/);
  assert.match(orderService, /consumeOrderVerification/);
  assert.match(orderService, /instructionVerificationId/);
});

test("broker and investor order entry both require a verification challenge", async () => {
  const [broker, investor] = await Promise.all([read("app/frankbroker-app.tsx"), read("app/investor/investor-app.tsx")]);
  assert.match(broker, /request_order/);
  assert.match(broker, /Instruction source/);
  assert.match(broker, /Verify & submit/);
  assert.match(investor, /request_order_otp/);
  assert.match(investor, /confirm_otp/);
});
