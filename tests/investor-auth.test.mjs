import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { isInvestorDemoAuthEnabled } from "../lib/deployment-mode.ts";
import {
  investorAuthMode,
  investorLoginPayloadHash,
  normalizeInvestorLogin,
} from "../lib/investor-auth.ts";
import {
  expiredSessionCookieHeaders,
  sessionCookieHeaders,
} from "../lib/server-auth.ts";

function preserveEnvironment(t) {
  const deployment = process.env.FRANK_DEPLOYMENT_MODE;
  const auth = process.env.FRANK_INVESTOR_AUTH_MODE;
  t.after(() => {
    if (deployment === undefined) delete process.env.FRANK_DEPLOYMENT_MODE;
    else process.env.FRANK_DEPLOYMENT_MODE = deployment;
    if (auth === undefined) delete process.env.FRANK_INVESTOR_AUTH_MODE;
    else process.env.FRANK_INVESTOR_AUTH_MODE = auth;
  });
}

test("investor auth is demo by default and fails closed to OTP in production", (t) => {
  preserveEnvironment(t);
  delete process.env.FRANK_DEPLOYMENT_MODE;
  delete process.env.FRANK_INVESTOR_AUTH_MODE;
  assert.equal(investorAuthMode(), "demo");
  assert.equal(isInvestorDemoAuthEnabled(), true);

  process.env.FRANK_DEPLOYMENT_MODE = "production";
  assert.equal(investorAuthMode(), "otp");
  assert.equal(isInvestorDemoAuthEnabled(), false);
});

test("explicit OTP mode disables browser-selected investor identity even in a demo environment", (t) => {
  preserveEnvironment(t);
  process.env.FRANK_DEPLOYMENT_MODE = "demo";
  process.env.FRANK_INVESTOR_AUTH_MODE = " OTP ";
  assert.equal(investorAuthMode(), "otp");
  assert.equal(isInvestorDemoAuthEnabled(), false);
});

test("login normalization and binding hashes never depend on display formatting", () => {
  assert.equal(normalizeInvestorLogin(" Selam@Example.ET "), "selam@example.et");
  assert.equal(normalizeInvestorLogin("+251 (911) 000-041"), "251911000041");
  assert.equal(
    investorLoginPayloadHash("cli_1", "+251 911 000 041"),
    investorLoginPayloadHash("cli_1", "251911000041"),
  );
  assert.notEqual(
    investorLoginPayloadHash("cli_1", "251911000041"),
    investorLoginPayloadHash("cli_2", "251911000041"),
  );
});

test("session cookies are host-bound on HTTPS and clear both production and local names", () => {
  const [cookie] = sessionCookieHeaders(new Request("https://invest.frank.et/api/auth/investor"), "token");
  assert.match(cookie, /^__Host-frank_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /; Secure/);
  const cleared = expiredSessionCookieHeaders().join("\n");
  assert.match(cleared, /__Host-frank_session=/);
  assert.match(cleared, /frank_session=/);
  assert.match(cleared, /Max-Age=0/);
});

test("passkeys use user verification and exact-order proofs without storing biometrics", async () => {
  const [service, route, verification, schema, migration, login, manager] = await Promise.all([
    readFile(new URL("../lib/investor-passkeys.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/investor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/verification-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20260904110000_investor_passkeys/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../features/investor/auth/investor-login.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/investor/auth/passkey-manager.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(service, /userVerification: "required"/);
  assert.match(service, /requireUserVerification: true/);
  assert.match(service, /payloadHash: input\.payloadHash/);
  assert.match(route, /request_order_passkey/);
  assert.match(route, /assertInvestorOrderPasskey/);
  assert.match(verification, /preAuthMethod !== "webauthn_uv"/);
  assert.match(verification, /investorPasskeyChallenge\.updateMany/);
  assert.match(schema, /model InvestorPasskey/);
  assert.match(migration, /"public_key" BYTEA NOT NULL/);
  assert.match(login, /passkey_login_options/);
  assert.match(manager, /register_options/);
  for (const source of [service, route, verification, schema, migration]) {
    assert.doesNotMatch(source, /faceprint|fingerprint_template|biometric_template/i);
  }
});
