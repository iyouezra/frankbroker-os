import test from "node:test";
import assert from "node:assert/strict";

import { backfillIdentityReference, clientIdentityReference, planIdentityBackfill } from "../lib/client-identity.ts";

test("the same Fayda always produces the same reference", () => {
  const a = clientIdentityReference({ clientType: "individual", faydaId: "1234567890123456" });
  const b = clientIdentityReference({ clientType: "individual", faydaId: "1234567890123456" });
  assert.equal(a, b);
  // A SHA-256 hex digest, never the raw identifier.
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(a, /1234567890123456/);
});

test("Fayda formatting is ignored so spacing cannot create a duplicate", () => {
  const plain = clientIdentityReference({ clientType: "individual", faydaId: "1234567890123456" });
  const spaced = clientIdentityReference({ clientType: "individual", faydaId: "1234 5678 9012 3456" });
  const dashed = clientIdentityReference({ clientType: "individual", faydaId: "1234-5678-9012-3456" });
  assert.equal(plain, spaced);
  assert.equal(plain, dashed);
});

test("different individuals get different references", () => {
  const one = clientIdentityReference({ clientType: "individual", faydaId: "1111111111111111" });
  const two = clientIdentityReference({ clientType: "individual", faydaId: "2222222222222222" });
  assert.notEqual(one, two);
});

test("organizations are keyed by business registration, not the representative's Fayda", () => {
  // Two entities that happen to share an authorized representative (same Fayda)
  // must not collide — the entity's registration number is what identifies it.
  const acme = clientIdentityReference({ clientType: "corporate", faydaId: "9999999999999999", businessRegistrationNumber: "BR-0001" });
  const globex = clientIdentityReference({ clientType: "corporate", faydaId: "9999999999999999", businessRegistrationNumber: "BR-0002" });
  assert.notEqual(acme, globex);

  // The same entity is the same whoever files it, and registration formatting is normalized.
  const acmeAgain = clientIdentityReference({ clientType: "institution", faydaId: "0000000000000000", businessRegistrationNumber: " br-0001 " });
  assert.equal(acme, acmeAgain);
});

test("an individual and an organization never share a reference", () => {
  const person = clientIdentityReference({ clientType: "individual", faydaId: "5550005550005550" });
  const org = clientIdentityReference({ clientType: "corporate", businessRegistrationNumber: "5550005550005550" });
  assert.notEqual(person, org);
});

/* --------------------------------------------------------------- backfill --- */

test("backfill can recompute organizations but never individuals", () => {
  assert.equal(backfillIdentityReference({ clientType: "individual", businessRegistrationNumber: null }), null);
  assert.equal(backfillIdentityReference({ clientType: "corporate", businessRegistrationNumber: null }), null);
  assert.equal(backfillIdentityReference({ clientType: "corporate", businessRegistrationNumber: "" }), null);
  assert.equal(
    backfillIdentityReference({ clientType: "corporate", businessRegistrationNumber: "BR-1" }),
    clientIdentityReference({ clientType: "corporate", businessRegistrationNumber: "BR-1" }),
  );
});

test("the backfill plan updates stale orgs and categorizes the rest", () => {
  const staleRef = clientIdentityReference({ clientType: "corporate", businessRegistrationNumber: "BR-1" });
  const doneRef = clientIdentityReference({ clientType: "institution", businessRegistrationNumber: "BR-2" });
  const plan = planIdentityBackfill([
    { id: "cli_ind", brokerId: "brk_a", clientType: "individual", identityReference: "broker_fayda_random", businessRegistrationNumber: null },
    { id: "cli_stale", brokerId: "brk_a", clientType: "corporate", identityReference: "broker_fayda_old", businessRegistrationNumber: "BR-1" },
    { id: "cli_done", brokerId: "brk_a", clientType: "institution", identityReference: doneRef, businessRegistrationNumber: "br-2" },
    { id: "cli_noreg", brokerId: "brk_a", clientType: "corporate", identityReference: "x", businessRegistrationNumber: null },
  ]);

  assert.deepEqual(plan.skippedIndividuals, ["cli_ind"]);
  assert.deepEqual(plan.skippedNoRegistration, ["cli_noreg"]);
  assert.deepEqual(plan.updates, [{ id: "cli_stale", brokerId: "brk_a", from: "broker_fayda_old", to: staleRef }]);
  assert.deepEqual(plan.alreadyCorrect, ["cli_done"]);
  assert.equal(plan.collisions.length, 0);
});

test("two orgs that resolve to the same reference are flagged, not half-applied", () => {
  const plan = planIdentityBackfill([
    { id: "cli_x", brokerId: "brk_a", clientType: "corporate", identityReference: "old_x", businessRegistrationNumber: "BR-9" },
    { id: "cli_y", brokerId: "brk_a", clientType: "corporate", identityReference: "old_y", businessRegistrationNumber: " br-9 " },
  ]);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.collisions.length, 1);
  assert.deepEqual(plan.collisions[0].clientIds.sort(), ["cli_x", "cli_y"]);
});

test("the same registration at different brokers is not a collision", () => {
  const plan = planIdentityBackfill([
    { id: "cli_a", brokerId: "brk_a", clientType: "corporate", identityReference: "old_a", businessRegistrationNumber: "BR-1" },
    { id: "cli_b", brokerId: "brk_b", clientType: "corporate", identityReference: "old_b", businessRegistrationNumber: "BR-1" },
  ]);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.updates.length, 2);
});
