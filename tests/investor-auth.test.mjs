import assert from "node:assert/strict";
import test from "node:test";

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
