import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateRestorationControls,
  inferRestrictionCategory,
  restrictionResolutionGuidance,
} from "../lib/restriction-resolution.ts";

const readyControls = {
  kycStatus: "approved",
  screeningStatus: "clear",
  expectedDocuments: ["proof_of_address"],
  approvedDocuments: ["proof_of_address"],
  consentReady: true,
};

test("legacy free-text restriction reasons are mapped to a guided resolution category", () => {
  assert.equal(inferRestrictionCategory("Periodic KYC refresh is overdue"), "kyc_overdue");
  assert.equal(inferRestrictionCategory("Beneficial ownership evidence unverified"), "missing_documents");
  assert.equal(inferRestrictionCategory("Suspicious activity review — screening alert"), "suspicious_activity");
  assert.ok(restrictionResolutionGuidance("kyc_overdue").some((step) => /KYC review/i.test(step)));
});

test("restoration is ready only when every mandatory account control passes", () => {
  const result = evaluateRestorationControls(readyControls);
  assert.equal(result.ready, true);
  assert.deepEqual(result.blockers, []);
  assert.ok(result.controls.every((control) => control.passed));
});

test("restoration reports actionable blockers for unresolved controls", () => {
  const result = evaluateRestorationControls({
    ...readyControls,
    kycStatus: "review_due",
    screeningStatus: "potential_match",
    approvedDocuments: [],
    consentReady: false,
  });
  assert.equal(result.ready, false);
  assert.equal(result.blockers.length, 4);
  assert.match(result.blockers.join(" "), /KYC review/);
  assert.match(result.blockers.join(" "), /screening result/);
  assert.match(result.blockers.join(" "), /proof_of_address/);
  assert.match(result.blockers.join(" "), /brokerage terms/);
});
