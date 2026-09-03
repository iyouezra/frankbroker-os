import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  brokerChannelGuidance,
  failedOutcome,
  heldOutcome,
  orderChannelLabels,
  submittedOutcome,
} from "../lib/order-submission-ux.ts";

test("investor success copy distinguishes submission from execution", () => {
  const outcome = submittedOutcome({ audience: "investor", orderId: "ORD-100", channel: "investor_portal" });
  assert.equal(outcome.title, "Order submitted");
  assert.match(outcome.message, /submitted for broker review/i);
  assert.match(outcome.nextStep, /does not mean.*executed/i);
  assert.equal(outcome.orderId, "ORD-100");
});

test("broker outcomes retain the non-digital instruction channel", () => {
  for (const channel of ["phone", "in_person", "neway"]) {
    const outcome = submittedOutcome({ audience: "broker", orderId: "ORD-200", channel });
    assert.match(outcome.message, new RegExp(orderChannelLabels[channel], "i"));
    assert.match(outcome.nextStep, /validation, review, approval, and execution controls/i);
  }
});

test("held orders tell both audiences not to submit a duplicate", () => {
  const investor = heldOutcome({ audience: "investor", orderId: "ORD-300", channel: "investor_portal", detail: "Cash check failed" });
  const broker = heldOutcome({ audience: "broker", orderId: "ORD-301", channel: "phone", detail: "Cash check failed" });
  assert.match(investor.nextStep, /do not submit.*again/i);
  assert.match(broker.nextStep, /do not bypass/i);
  assert.equal(investor.detail, "Cash check failed");
});

test("network interruption becomes uncertain instead of a false failure", () => {
  const uncertain = failedOutcome({ audience: "broker", stage: "submission", channel: "in_person", detail: "Network timeout" });
  assert.equal(uncertain.kind, "submission_uncertain");
  assert.match(uncertain.nextStep, /search the order log/i);
  const authorization = failedOutcome({ audience: "investor", stage: "authorization", channel: "investor_portal", detail: "The verification code is incorrect." });
  assert.equal(authorization.kind, "authorization_failed");
  assert.match(authorization.message, /no order was submitted/i);
});

test("every broker entry channel has evidence and authorization guidance", () => {
  for (const channel of ["digital", "phone", "in_person", "neway"]) {
    assert.ok(brokerChannelGuidance[channel].heading);
    assert.ok(brokerChannelGuidance[channel].evidence);
    assert.ok(brokerChannelGuidance[channel].authorization);
  }
});

test("investor order flow uses an in-app OTP dialog and explicit outcome screens", async () => {
  const [app, dialogs, copy] = await Promise.all([
    readFile(new URL("../app/investor/investor-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/investor/orders/order-submission-dialogs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/i18n/en.ts", import.meta.url), "utf8"),
  ]);
  const placeOrder = app.slice(app.indexOf("const placeOrder"), app.indexOf("// Support conversations"));
  assert.doesNotMatch(placeOrder, /window\.prompt/);
  assert.match(placeOrder, /request_order_otp/);
  assert.match(placeOrder, /submission_uncertain|failedOutcome/);
  assert.match(dialogs, /autoComplete="one-time-code"/);
  assert.match(dialogs, /otp\.resend/);
  assert.match(dialogs, /otp\.textMessage/);
  assert.match(dialogs, /otp\.email/);
  assert.match(copy, /"otp\.textMessage": "Text message"/);
  assert.match(copy, /"otp\.email": "Email"/);
  assert.match(placeOrder, /deliveryChannel: "sms"/);
  assert.match(dialogs, /outcome\.viewOrders/);
  assert.match(copy, /"outcome\.viewOrders": "View orders"/);
});

test("eligible investors see a commission-free notice and receive a durable notification", async () => {
  const [app, investorRoute, tenantRoute, clientService, copy] = await Promise.all([
    readFile(new URL("../app/investor/investor-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/investor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tenant/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/client-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/i18n/en.ts", import.meta.url), "utf8"),
  ]);
  assert.match(app, /promotionBanner/);
  assert.match(app, /commissionPromotion\.name/);
  assert.match(copy, /brokerage commission is waived for orders submitted/);
  assert.match(copy, /ECMA, ESX, and CSD charges still apply/);
  assert.match(investorRoute, /selectCommissionPromotion/);
  assert.match(investorRoute, /brokeragePct: 0/);
  assert.match(tenantRoute, /commission-promotion:/);
  assert.match(clientService, /writeNotificationOnce/);
});

test("investor buy orders cannot exceed available buying power", async () => {
  const [orderService, orderSheet, securityDetails] = await Promise.all([
    readFile(new URL("../lib/oms/order-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/investor/orders/order-sheets.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/investor/markets/security-detail-screens.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(orderService, /input\.source === "investor_portal" && input\.side === "buy" && account\.availableCash\.lt\(amounts\.net\)/);
  assert.match(orderService, /currentAccount\.availableCash\.lt\(amounts\.net\)/);
  assert.match(orderService, /only \$\{availableCash\.toFixed\(2\)\} ETB is available/);
  assert.match(orderSheet, /totalCost <= availableCash/);
  assert.match(orderSheet, /disabled=\{gross <= 0[^}]*!hasBuyingPower/);
  assert.match(securityDetails, /availableCash=\{availableCash\}/);
});

test("client commission is refreshed and disclosed before investor review and retained in the broker log", async () => {
  const investorOrders = await readFile(new URL("../features/investor/orders/order-sheets.tsx", import.meta.url), "utf8");
  const brokerOrders = await readFile(new URL("../features/broker/orders/order-log-screen.tsx", import.meta.url), "utf8");
  const feeService = await readFile(new URL("../lib/oms/fee-service.ts", import.meta.url), "utf8");
  assert.match(investorOrders, /await onRefreshPricing\(\);/);
  assert.match(investorOrders, /commissionSource === "client_override"/);
  assert.match(brokerOrders, /Client-specific/);
  assert.match(brokerOrders, /ratesPct\?\.brokerage/);
  assert.match(feeService, /clientCommissionMandateVersion/);
  assert.match(feeService, /commissionSource: policy\.commissionSource/);
});

test("order authorization supports masked SMS and email delivery", async () => {
  const [verification, investorRoute, brokerRoute] = await Promise.all([
    readFile(new URL("../lib/verification-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/investor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/verifications/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(verification, /OTP_DELIVERY_CHANNELS = \["sms", "email"\]/);
  assert.match(verification, /method: `\$\{deliveryChannel\}_otp`/);
  assert.match(verification, /otpDestinationHint/);
  assert.match(investorRoute, /payload\.deliveryChannel/);
  assert.match(brokerRoute, /payload\.verificationChannel/);
});

test("broker entry invalidates authorization and validation when protected order fields change", async () => {
  const source = await readFile(new URL("../features/broker/orders/order-drawers.tsx", import.meta.url), "utf8");
  assert.match(source, /onInstructionChange\(\)/);
  assert.match(source, /verificationId: "", verificationCode: "", demoCode: ""/);
  assert.match(source, /NON-DIGITAL SOURCE/);
  assert.match(source, /Client authorization code/);
});
