import assert from "node:assert/strict";
import test from "node:test";

import {
  FAYDA_ONBOARDING_FIELD_POLICY,
  FAYDA_REQUESTED_USERINFO_CLAIMS,
  mapVerifiedFaydaUserInfo,
} from "../lib/fayda-claims.ts";

test("Fayda requests the profile and restricted identity claims used by onboarding", () => {
  assert.deepEqual(Object.keys(FAYDA_REQUESTED_USERINFO_CLAIMS), ["name", "phone_number", "email", "picture", "gender", "birthdate", "address"]);
  assert.deepEqual(FAYDA_ONBOARDING_FIELD_POLICY.showAndConfirmWhenReturned, ["fullName", "email"]);
  assert.deepEqual(FAYDA_ONBOARDING_FIELD_POLICY.prefillInstitutionRepresentativeWhenReturned, ["representativeName", "phone"]);
  assert.deepEqual(FAYDA_ONBOARDING_FIELD_POLICY.retainAsRestrictedIdentityEvidence, ["gender", "picture"]);
  assert.ok(FAYDA_ONBOARDING_FIELD_POLICY.collectSeparately.includes("tin"));
  assert.ok(FAYDA_ONBOARDING_FIELD_POLICY.collectSeparately.includes("pepStatus"));
  assert.ok(FAYDA_ONBOARDING_FIELD_POLICY.collectSeparately.includes("bankAccounts"));
});

test("verified Fayda UserInfo maps localized eKYC claims and the OIDC identity", () => {
  const mapped = mapVerifiedFaydaUserInfo({
    iss: "https://esignet.example.et",
    sub: "opaque-fayda-subject",
    "name#en": "Selam Mekonnen",
    "name#am": "ሰላም መኮንን",
    phone_number: "+251911000041",
    email: "selam@example.et",
    picture: "https://media.esignet.example.et/portrait/123",
    gender: "female",
    birthdate: "1990-01-01",
    address: { locality: "Addis Ababa", country: "Ethiopia" },
  }, {
    expectedIssuer: "https://esignet.example.et",
    locales: ["en", "am"],
    assuranceContext: "mosip:idp:acr:generated-code",
    authenticationMethods: ["otp"],
  });
  assert.deepEqual(mapped.profile, {
    fullName: "Selam Mekonnen",
    phone: "+251911000041",
    email: "selam@example.et",
    pictureUrl: "https://media.esignet.example.et/portrait/123",
    gender: "female",
    dateOfBirth: "1990-01-01",
    address: "Addis Ababa, Ethiopia",
  });
  assert.deepEqual(mapped.identity, {
    provider: "fayda_esignet",
    issuer: "https://esignet.example.et",
    subject: "opaque-fayda-subject",
    assuranceContext: "mosip:idp:acr:generated-code",
    authenticationMethods: ["otp"],
    gender: "female",
  });
});

test("Fayda mapper accepts the guide's inconsistent phone example but rejects issuer substitution", () => {
  const mapped = mapVerifiedFaydaUserInfo({ iss: "https://id.et", sub: "subject", phone: "0911000041" }, { expectedIssuer: "https://id.et" });
  assert.equal(mapped.profile.phone, "0911000041");
  assert.throws(
    () => mapVerifiedFaydaUserInfo({ iss: "https://attacker.example", sub: "subject" }, { expectedIssuer: "https://id.et" }),
    (error) => error instanceof Response && error.status === 401,
  );
});

test("the two investor demo accounts remain available in labelled demo mode", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/investor/investor-app.tsx", import.meta.url), "utf8"));
  assert.match(source, /id: "cli_investor_demo"[\s\S]*name: "Selam Mekonnen"/);
  assert.match(source, /id: "cli_blue"[\s\S]*name: "Blue Nile Trading PLC"/);
  assert.match(source, /const insecureDemoUiEnabled = authMode === "demo"/);
});
