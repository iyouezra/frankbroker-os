import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { clientIdentityReference } from "../lib/client-identity.ts";
import { MONITORING_PERMISSIONS, hasPermission } from "../lib/frank.ts";
import {
  MONITORING_RULES,
  appliesHighRiskMultiplier,
  historicalDeviation,
  validDepositFundingSource,
  fragmentationTriggered,
  closedLoopWithdrawalRisk,
  personalClearanceCovers,
  isMonitoringEnabled,
  normalizeVerifiedPhone,
  raiseSeverity,
  taxIdentityReference,
  cancellationPatternTriggered,
  isAttestationOverdue,
  isImmediateEmployeeConductRule,
} from "../lib/monitoring.ts";

test("the selected AML and employee-conduct rule catalogue is explicit", () => {
  assert.deepEqual(
    Object.keys(MONITORING_RULES).filter((code) => /^AML_P\d$/.test(code)),
    ["AML_P1", "AML_P4", "AML_P5", "AML_P7"],
  );
  assert.ok("AML_P8_KYC" in MONITORING_RULES);
  assert.ok("AML_P9_UNFUNDED_DESTINATION" in MONITORING_RULES);
  assert.ok("EC_FRONT_RUNNING" in MONITORING_RULES);
  assert.equal("AML_P2" in MONITORING_RULES, false);
  assert.equal("AML_P3" in MONITORING_RULES, false);
  assert.equal("AML_P6" in MONITORING_RULES, false);
});

test("historical deviation waits for the approved baseline and uses its median", () => {
  const young = historicalDeviation({ amount: 1_000, completedMovementCount: 20, sameDirectionAmounts: [100, 100, 100, 100, 100], clientCreatedAt: new Date("2026-01-01"), now: new Date("2026-03-01") });
  assert.equal(young, null);
  const sparse = historicalDeviation({ amount: 1_000, completedMovementCount: 20, sameDirectionAmounts: [100, 100, 100, 100], clientCreatedAt: new Date("2025-01-01"), now: new Date("2026-03-01") });
  assert.equal(sparse, null);
  const ordinary = historicalDeviation({ amount: 499, completedMovementCount: 10, sameDirectionAmounts: [80, 90, 100, 110, 120], clientCreatedAt: new Date("2025-01-01"), now: new Date("2026-03-01") });
  assert.equal(ordinary, null);
  assert.deepEqual(historicalDeviation({ amount: 500, completedMovementCount: 10, sameDirectionAmounts: [80, 90, 100, 110, 120], clientCreatedAt: new Date("2025-01-01"), now: new Date("2026-03-01") }), { baseline: 100, multiple: 5 });
});

test("P1 and P4 use approved same-client sources and a configurable count-only window", () => {
  assert.equal(validDepositFundingSource({ sourceBankStatus: "approved", sourceBankClientId: "cli_a", movementClientId: "cli_a" }), true);
  assert.equal(validDepositFundingSource({ sourceBankStatus: "approved", sourceBankClientId: "cli_b", movementClientId: "cli_a" }), false);
  assert.equal(validDepositFundingSource({ sourceBankStatus: null, sourceBankClientId: null, movementClientId: "cli_a" }), false);
  assert.equal(fragmentationTriggered(2, 3), false);
  assert.equal(fragmentationTriggered(3, 3), true);
  assert.equal(fragmentationTriggered(5, 5), true);
});

test("P9 distinguishes rapid first withdrawals from unfunded destinations", () => {
  assert.deepEqual(closedLoopWithdrawalRisk({ destinationFunded: false, hasPriorWithdrawal: false, clientAgeDays: 2 }), { unfundedDestination: true, rapidFirstWithdrawal: true });
  assert.deepEqual(closedLoopWithdrawalRisk({ destinationFunded: true, hasPriorWithdrawal: false, clientAgeDays: 10 }), { unfundedDestination: false, rapidFirstWithdrawal: false });
  assert.deepEqual(closedLoopWithdrawalRisk({ destinationFunded: true, hasPriorWithdrawal: true, clientAgeDays: 2 }), { unfundedDestination: false, rapidFirstWithdrawal: false });
});

test("personal-trade clearance cannot be absent or exceeded", () => {
  assert.equal(personalClearanceCovers({ present: false, quantity: 1, value: 100 }), false);
  assert.equal(personalClearanceCovers({ present: true, quantity: 100, value: 50_000, maxQuantity: 100, maxValue: 50_000 }), true);
  assert.equal(personalClearanceCovers({ present: true, quantity: 101, value: 50_000, maxQuantity: 100, maxValue: 50_000 }), false);
  assert.equal(personalClearanceCovers({ present: true, quantity: 100, value: 50_001, maxQuantity: 100, maxValue: 50_000 }), false);
});

test("employee coverage and targeted cancellation controls are deterministic", () => {
  assert.equal(cancellationPatternTriggered(2, 3), false);
  assert.equal(cancellationPatternTriggered(3, 3), true);
  assert.equal(isAttestationOverdue({ dueAt: new Date("2026-03-31"), attestedYears: [], now: new Date("2026-04-01") }), true);
  assert.equal(isAttestationOverdue({ dueAt: new Date("2026-03-31"), attestedYears: [2026], now: new Date("2026-04-01") }), false);
  assert.equal(isImmediateEmployeeConductRule("EC_RESTRICTED_SECURITY"), true);
  assert.equal(isImmediateEmployeeConductRule("EC_CANCELLATION_PATTERN"), false);
});

test("P8 raises another alert by one severity level only", () => {
  assert.equal(appliesHighRiskMultiplier({ pepStatus: "pep", riskRating: "standard", kycStatus: "approved" }), true);
  assert.equal(appliesHighRiskMultiplier({ pepStatus: "not_pep", riskRating: "enhanced", kycStatus: "approved" }), true);
  assert.equal(appliesHighRiskMultiplier({ pepStatus: "not_pep", riskRating: "standard", kycStatus: "approved" }), false);
  assert.equal(raiseSeverity("medium"), "high");
  assert.equal(raiseSeverity("critical"), "critical");
});

test("shared identifiers use exact normalized or hashed values, never masked display values", () => {
  assert.equal(normalizeVerifiedPhone("0911 234 567"), "251911234567");
  assert.equal(normalizeVerifiedPhone("+251 911 234 567"), "251911234567");
  const tin = taxIdentityReference("0012 345 678");
  assert.match(tin, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(tin, /0012345678/);
  const fayda = "1234567890123456";
  assert.equal(
    clientIdentityReference({ clientType: "individual", faydaId: fayda }),
    clientIdentityReference({ clientType: "individual", faydaId: fayda }),
  );
});

test("monitoring defaults off and only an exact feature flag activates it", () => {
  assert.equal(isMonitoringEnabled(undefined), false);
  assert.equal(isMonitoringEnabled({ riskComplianceMonitoring: false }), false);
  assert.equal(isMonitoringEnabled({ riskComplianceMonitoring: true }), true);
});

test("sensitive monitoring is compliance-only while aggregate oversight is bounded", () => {
  assert.equal(hasPermission("compliance", MONITORING_PERMISSIONS.sensitive), true);
  assert.equal(hasPermission("compliance", MONITORING_PERMISSIONS.ruleManage), true);
  assert.equal(hasPermission("broker_admin", MONITORING_PERMISSIONS.summary), true);
  assert.equal(hasPermission("management", MONITORING_PERMISSIONS.summary), true);
  assert.equal(hasPermission("broker_admin", MONITORING_PERMISSIONS.sensitive), false);
  assert.equal(hasPermission("management", MONITORING_PERMISSIONS.sensitive), false);
  assert.equal(hasPermission("super_admin", MONITORING_PERMISSIONS.summary), false);
  assert.equal(hasPermission("super_admin", MONITORING_PERMISSIONS.sensitive), false);
  assert.equal(hasPermission("trader", MONITORING_PERMISSIONS.selfService), true);
  assert.equal(hasPermission("settlement", MONITORING_PERMISSIONS.selfService), true);
  assert.equal(hasPermission("super_admin", MONITORING_PERMISSIONS.selfService), false);
});

test("the additive migration and enforcement paths cover the approved scope", async () => {
  const root = new URL("../", import.meta.url);
  const [schema, migration, cash, orders, trade, seed, reports, monitoringService, selfService] = await Promise.all([
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
    readFile(new URL("prisma/migrations/20260814120000_risk_compliance_monitoring/migration.sql", root), "utf8"),
    readFile(new URL("lib/cash-service.ts", root), "utf8"),
    readFile(new URL("lib/oms/order-service.ts", root), "utf8"),
    readFile(new URL("lib/oms/trade-service.ts", root), "utf8"),
    readFile(new URL("prisma/seed.ts", root), "utf8"),
    readFile(new URL("features/broker/oversight/reporting-screens.tsx", root), "utf8"),
    readFile(new URL("lib/monitoring-service.ts", root), "utf8"),
    readFile(new URL("app/api/compliance/employee-conduct/me/route.ts", root), "utf8"),
  ]);
  for (const model of ["MonitoringAlert", "MonitoringCase", "MonitoringEvidence", "MonitoringAuditEvent", "EmployeeConductProfile", "PersonalTradeClearance", "RestrictedSecurity", "WithdrawalDestinationException"]) assert.match(schema, new RegExp(`model ${model}`));
  assert.match(migration, /CREATE TABLE "monitoring_alerts"/);
  assert.match(migration, /CREATE TABLE "employee_conduct_profiles"/);
  assert.match(migration, /source_linked_bank_account_id/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/);
  assert.match(cash, /assertCashMonitoringClearance/);
  assert.match(cash, /sourceLinkedBankAccountId/);
  assert.match(orders, /evaluateEmployeeOrder/);
  assert.match(orders, /EC_FRONT_RUNNING/);
  assert.match(orders, /prior business-day window/);
  assert.match(trade, /assertNoEmployeeSelfProcessing/);
  assert.match(monitoringService, /different-user withdrawal-destination exception/);
  assert.match(monitoringService, /recordMonitoringEvidence/);
  assert.match(monitoringService, /listEmployeePersonalDealing/);
  assert.match(monitoringService, /runEmployeeConductSweep/);
  assert.match(monitoringService, /IMMEDIATE_ESCALATION_CREATED/);
  assert.match(selfService, /MONITORING_PERMISSIONS\.selfService/);
  assert.doesNotMatch(selfService, /employeeProfileId: String\(payload/);
  assert.match(seed, /riskComplianceMonitoring: false/);
  assert.match(reports, /monthly_transactions/);
  assert.match(reports, /quarterly_complaints/);
  assert.doesNotMatch(reports, /Suspicious transaction report|Employee conduct report/);
});
