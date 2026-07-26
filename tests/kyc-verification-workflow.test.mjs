import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readBrokerFrontend, readInvestorFrontend } from "./frontend-source.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("digital KYC remains pending broker review and receives an account only after approval", async () => {
  const [route, clientService] = await Promise.all([read("app/api/investor/route.ts"), read("lib/client-service.ts")]);
  assert.match(route, /kycStatus: "pending_review"/);
  assert.match(route, /status: "pending_approval"/);
  assert.match(route, /clientCode: updated\.clientCode/);
  assert.match(route, /accountNumber: account\?\.accountNumber/);
  assert.doesNotMatch(route, /applicationAccountNumber/);
  assert.match(clientService, /const clientId = `cli_/);
  assert.match(clientService, /const accountNumber = `TRD-/);
  assert.match(clientService, /if \(client\.accounts\.length === 0\)/);
  assert.match(clientService, /await tx\.account\.create/);
});

test("investor onboarding captures email and the full institutional document set", async () => {
  const [investor, route] = await Promise.all([
    readInvestorFrontend(),
    read("app/api/investor/route.ts"),
  ]);
  assert.match(investor, /label="Email address"/);
  assert.match(investor, /Certificate of Incorporation/);
  assert.match(investor, /Article of Association/);
  assert.match(investor, /emailValid/);
  assert.match(investor, /onVerifyIdentity\(profile\.phone\)/);
  assert.match(investor, /verificationId: profile\.verificationId/);
  assert.match(investor, /responseText = await response\.text\(\)/);
  assert.match(investor, /setPhase\("app"\)/);
  assert.match(investor, /refreshInvestor\(result\.profile\.id\)\.catch/);
  assert.match(route, /const email = String\(payload\.email/);
  assert.match(route, /emailValid/);
  assert.match(route, /resumableApplication/);
  assert.match(route, /roles: SERVICE/);
  assert.match(route, /dedupeKey: `investor-onboarding:/);
  assert.match(route, /\n\s+email,\n/);

  const identityValidation = investor.slice(investor.indexOf("const identityStepValid"), investor.indexOf("const bankStepValid"));
  assert.doesNotMatch(identityValidation, /businessLicenseFile|tinCertificateFile|certificateOfIncorporationFile|articleOfAssociationFile/);
});

test("order authorization is exact-payload-bound, expiring, attempt-limited, and single-use", async () => {
  const [verification, orderService] = await Promise.all([read("lib/verification-service.ts"), read("lib/oms/order-service.ts")]);
  for (const field of ["accountId", "instrumentId", "side", "quantity", "price", "triggerPrice", "orderType", "source", "submissionReference"]) {
    assert.match(verification, new RegExp(field));
  }
  assert.match(verification, /maxAttempts/);
  assert.match(verification, /expiresAt/);
  assert.match(verification, /consumedAt: null/);
  assert.match(verification, /timingSafeEqual/);
  assert.match(verification, /FRANK_DEMO_OTP_CODE/);
  assert.match(verification, /must contain exactly six digits/);
  assert.match(verification, /configured \|\| "246810"/);
  assert.match(verification, /demoCode \?\? String\(randomInt/);
  assert.match(orderService, /consumeOrderVerification/);
  assert.match(orderService, /instructionVerificationId/);
});

test("investor Stop-Loss orders require and persist a trigger price", async () => {
  const [investor, route, schema, migration, orderService] = await Promise.all([
    readInvestorFrontend(),
    read("app/api/investor/route.ts"),
    read("prisma/schema.prisma"),
    read("prisma/migrations/20260723190000_add_order_trigger_price/migration.sql"),
    read("lib/oms/order-service.ts"),
  ]);
  assert.match(investor, /Trigger when price falls to/);
  assert.match(investor, /triggerPrice: isStopLoss \? triggerValue/);
  assert.match(route, /A Stop-Loss sell needs a positive trigger price below the current price/);
  assert.match(route, /triggerPrice: orderType === "stop_loss" \? triggerPriceInput : null/);
  assert.match(schema, /triggerPrice\s+Decimal\?/);
  assert.match(migration, /ADD COLUMN "trigger_price" DECIMAL\(20,6\)/);
  assert.match(orderService, /triggerPrice,/);
});

test("broker and investor order entry both require a verification challenge", async () => {
  const [broker, investor] = await Promise.all([readBrokerFrontend(), readInvestorFrontend()]);
  assert.match(broker, /request_order/);
  assert.match(broker, /Instruction source/);
  assert.match(broker, /Verify & submit/);
  assert.match(investor, /request_order_otp/);
  assert.match(investor, /confirm_otp/);
});
