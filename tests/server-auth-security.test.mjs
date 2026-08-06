import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../lib/prisma.ts";
import {
  createSessionToken,
  resolveActor,
  resolveInvestorContext,
} from "../lib/server-auth.ts";

const SECRET = "server-auth-test-secret-with-at-least-32-bytes";

function stub(t, object, method, implementation) {
  const original = object[method];
  object[method] = implementation;
  t.after(() => { object[method] = original; });
}

function responseStatus(status) {
  return (error) => error instanceof Response && error.status === status;
}

test("every deployment preserves demo role, tenant, and investor switching", async () => {
  const actor = await resolveActor(new Request("https://demo.example/api/orders", { headers: {
    "x-frank-demo-role": "compliance",
    "x-frank-tenant-id": "brk_sheba",
  } }));
  assert.equal(actor.role, "compliance");
  assert.equal(actor.brokerId, "brk_sheba");

  const investor = await resolveInvestorContext(new Request("https://demo.example/api/investor", { headers: {
    "x-frank-client-id": "cli_blue",
    "x-frank-tenant-id": "brk_blue_nile",
  } }));
  assert.deepEqual(investor, { brokerId: "brk_blue_nile", clientId: "cli_blue" });
});

test("signed broker sessions ignore spoofed headers and reload authority from PostgreSQL", async (t) => {
  const priorSecret = process.env.FRANK_SESSION_SECRET;
  process.env.FRANK_SESSION_SECRET = SECRET;
  t.after(() => {
    if (priorSecret === undefined) delete process.env.FRANK_SESSION_SECRET;
    else process.env.FRANK_SESSION_SECRET = priorSecret;
  });
  stub(t, prisma.user, "findFirst", async () => ({
    id: "usr_real",
    email: "real@broker.example",
    role: "compliance",
    brokerId: "brk_real",
  }));
  const token = createSessionToken({ kind: "broker", userId: "usr_real", brokerId: "brk_real" });
  const actor = await resolveActor(new Request("https://broker.example/api/orders", { headers: {
    authorization: `Bearer ${token}`,
    "x-frank-demo-role": "super_admin",
    "x-frank-tenant-id": "brk_victim",
  } }));
  assert.deepEqual(actor, {
    id: "usr_real",
    email: "real@broker.example",
    role: "compliance",
    brokerId: "brk_real",
  });

  const [payload, signature] = token.split(".");
  const tampered = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}.${signature}`;
  await assert.rejects(
    () => resolveActor(new Request("https://broker.example/api/orders", { headers: { authorization: `Bearer ${tampered}` } })),
    responseStatus(401),
  );
});

test("cookie sessions enforce same-origin writes and investor ownership comes from the database", async (t) => {
  const priorSecret = process.env.FRANK_SESSION_SECRET;
  process.env.FRANK_SESSION_SECRET = SECRET;
  t.after(() => {
    if (priorSecret === undefined) delete process.env.FRANK_SESSION_SECRET;
    else process.env.FRANK_SESSION_SECRET = priorSecret;
  });
  let ownershipWhere;
  stub(t, prisma.client, "findFirst", async ({ where }) => {
    ownershipWhere = where;
    return { id: "cli_real", brokerId: "brk_real" };
  });
  const token = createSessionToken({ kind: "investor", subjectId: "identity-subject", brokerId: "brk_real", clientId: "cli_real" });
  const cookie = `__Host-frank_session=${token}`;

  await assert.rejects(
    () => resolveInvestorContext(new Request("https://broker.example/api/investor", { method: "POST", headers: { cookie } })),
    responseStatus(403),
  );
  const context = await resolveInvestorContext(new Request("https://broker.example/api/investor", { method: "POST", headers: {
    cookie,
    origin: "https://broker.example",
    "x-frank-client-id": "cli_victim",
    "x-frank-tenant-id": "brk_victim",
  } }));
  assert.deepEqual(context, { brokerId: "brk_real", clientId: "cli_real" });
  assert.equal(ownershipWhere.portalAuthSubject, "identity-subject");
  assert.equal(ownershipWhere.brokerId, "brk_real");
  assert.equal(ownershipWhere.id, "cli_real");
});
