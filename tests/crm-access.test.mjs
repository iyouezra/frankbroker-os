import assert from "node:assert/strict";
import test from "node:test";

import {
  NOT_FOUND_MESSAGE,
  assertBrokerTenant,
  assertInvestorCanPost,
  assertInvestorOwns,
  brokerAttachmentWhere,
  canReplyAsInvestor,
  canViewThread,
  investorAttachmentWhere,
  investorThreadWhere,
} from "../lib/crm/access.ts";
import { CRM_PERMISSIONS, hasPermission, workflowPermissions } from "../lib/frank.ts";
import { requirePermission } from "../lib/server-auth.ts";

const ownThread = { brokerId: "brk_abyssinia", clientId: "cli_investor_demo" };
const otherTenant = { brokerId: "brk_blue_nile", clientId: "cli_investor_demo" };
const otherInvestor = { brokerId: "brk_abyssinia", clientId: "cli_meron" };

const status = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

test("a broker cannot reach a conversation in another tenant", () => {
  const actor = { id: "usr_service", role: "service_officer", brokerId: "brk_abyssinia" };
  assert.equal(canViewThread(actor, ownThread), true);
  assert.equal(canViewThread(actor, otherTenant), false);
  assert.doesNotThrow(() => assertBrokerTenant(actor, ownThread));
  const error = status(() => assertBrokerTenant(actor, otherTenant));
  assert.ok(error instanceof Response);
  assert.equal(error.status, 404);
});

test("an investor cannot reach another investor's conversation, even in the same tenant", () => {
  const context = { brokerId: "brk_abyssinia", clientId: "cli_investor_demo" };
  assert.doesNotThrow(() => assertInvestorOwns(context, ownThread));
  const crossInvestor = status(() => assertInvestorOwns(context, otherInvestor));
  const crossTenant = status(() => assertInvestorOwns(context, otherTenant));
  assert.equal(crossInvestor.status, 404);
  assert.equal(crossTenant.status, 404);
});

test("a missing record and a forbidden record are indistinguishable", async () => {
  const context = { brokerId: "brk_abyssinia", clientId: "cli_investor_demo" };
  const missing = status(() => assertInvestorOwns(context, null));
  const forbidden = status(() => assertInvestorOwns(context, otherInvestor));
  assert.equal(missing.status, forbidden.status);
  const [missingBody, forbiddenBody] = await Promise.all([missing.text(), forbidden.text()]);
  assert.equal(missingBody, forbiddenBody, "a probe must not distinguish absent from forbidden");
  assert.equal(missingBody, NOT_FOUND_MESSAGE);
});

test("query scopes always carry both tenant and client, and investors only reach shared attachments", () => {
  const context = { brokerId: "brk_abyssinia", clientId: "cli_investor_demo" };
  assert.deepEqual(investorThreadWhere(context), { brokerId: "brk_abyssinia", clientId: "cli_investor_demo" });

  const attachmentWhere = investorAttachmentWhere(context, "ATT-1");
  assert.equal(attachmentWhere.brokerId, "brk_abyssinia");
  assert.equal(attachmentWhere.clientId, "cli_investor_demo");
  assert.equal(attachmentWhere.visibility, "shared", "an internal attachment must be unreachable by id alone");
  assert.deepEqual(attachmentWhere.thread, { brokerId: "brk_abyssinia", clientId: "cli_investor_demo" });

  assert.deepEqual(brokerAttachmentWhere({ brokerId: "brk_abyssinia" }, "ATT-1"), { id: "ATT-1", brokerId: "brk_abyssinia" });
});

test("investors cannot post into a closed conversation", () => {
  assert.equal(canReplyAsInvestor("open"), true);
  assert.equal(canReplyAsInvestor("resolved"), true);
  assert.equal(canReplyAsInvestor("closed"), false);
  assert.doesNotThrow(() => assertInvestorCanPost({ status: "resolved" }));
  const error = status(() => assertInvestorCanPost({ status: "closed" }));
  assert.equal(error.status, 409);
});

test("CRM permissions are granted per role, and read-only roles cannot act", () => {
  assert.equal(hasPermission("service_officer", CRM_PERMISSIONS.reply), true);
  assert.equal(hasPermission("relationship_officer", CRM_PERMISSIONS.reply), true);
  assert.equal(hasPermission("management", CRM_PERMISSIONS.view), true);
  assert.equal(hasPermission("management", CRM_PERMISSIONS.reply), false, "read-only management must not reply");
  assert.equal(hasPermission("management", CRM_PERMISSIONS.note), false);
  assert.equal(hasPermission("trader", CRM_PERMISSIONS.reply), false, "a trader is not a service desk");
  assert.equal(hasPermission("trader", CRM_PERMISSIONS.note), true);
  assert.equal(hasPermission("relationship_officer", CRM_PERMISSIONS.assign), false, "reassignment stays with admins and service officers");
  assert.equal(hasPermission("service_officer", CRM_PERMISSIONS.assign), true);
});

test("the server rejects unauthorized roles at the permission gate", () => {
  const request = (role) => new Request("http://localhost/api/crm/threads", { headers: { "x-frank-demo-role": role } });
  assert.equal(requirePermission(request("service_officer"), CRM_PERMISSIONS.reply).role, "service_officer");
  assert.throws(
    () => requirePermission(request("management"), CRM_PERMISSIONS.reply),
    (error) => error instanceof Response && error.status === 403,
  );
  assert.throws(
    () => requirePermission(request("trader"), CRM_PERMISSIONS.assign),
    (error) => error instanceof Response && error.status === 403,
  );
});

test("adding CRM rights did not change any role's financial permissions", () => {
  const financial = (role) => workflowPermissions[role].filter((permission) => !permission.includes("."));
  assert.deepEqual(financial("broker_admin"), ["create", "approve", "reject", "trade", "settle", "adjust", "report"]);
  assert.deepEqual(financial("trader"), ["create", "trade", "report"]);
  assert.deepEqual(financial("operations"), ["create", "adjust", "report"]);
  assert.deepEqual(financial("compliance"), ["approve", "reject", "report"]);
  assert.deepEqual(financial("settlement"), ["settle", "adjust", "report"]);
  assert.deepEqual(financial("management"), ["report"]);
  assert.deepEqual(financial("super_admin"), ["create", "approve", "reject", "trade", "settle", "adjust", "report"]);
  // The two new service roles hold no trading or settlement authority.
  for (const role of ["relationship_officer", "service_officer"]) {
    for (const permission of ["approve", "reject", "trade", "settle", "adjust"]) {
      assert.equal(hasPermission(role, permission), false, `${role} must not hold ${permission}`);
    }
  }
});
