import assert from "node:assert/strict";
import test from "node:test";

import { roleLabels, workflowPermissions } from "../lib/frank.ts";
import { BROKER_ASSIGNABLE_ROLES, fallbackBrokerUsers, isBrokerAssignableRole } from "../lib/user-access.ts";

test("access administrators are isolated from financial workflows", () => {
  assert.equal(roleLabels.access_admin, "Broker access admin");
  assert.deepEqual(workflowPermissions.access_admin, ["access.manage"]);
  for (const permission of ["create", "approve", "trade", "settle", "adjust"]) {
    assert.equal(workflowPermissions.access_admin.includes(permission), false);
  }
});

test("broker invitations cannot assign platform or access-administrator roles", () => {
  assert.equal(isBrokerAssignableRole("trader"), true);
  assert.equal(isBrokerAssignableRole("access_admin"), false);
  assert.equal(isBrokerAssignableRole("super_admin"), false);
  assert.equal(BROKER_ASSIGNABLE_ROLES.includes("operations"), true);
});

test("workforce records carry employee identity and future authentication state", () => {
  assert.ok(fallbackBrokerUsers.length > 2);
  assert.equal(new Set(fallbackBrokerUsers.map((user) => user.employeeId)).size, fallbackBrokerUsers.length);
  assert.ok(fallbackBrokerUsers.every((user) => user.employeeId && user.fullName && user.email && user.jobTitle && user.department));
  assert.ok(fallbackBrokerUsers.every((user) => "authProvider" in user && "passwordResetRequired" in user && "accessReviewDueAt" in user));
});
