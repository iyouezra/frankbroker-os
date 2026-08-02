import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { strFromU8, unzipSync } from "fflate";
import {
  complaintRegulatoryStatus,
  assertPrescribedReportPeriod,
  ecmaInstrumentCategory,
  investorCategory,
  isDomesticInvestor,
  reportPeriod,
  twentyFourHourDueAt,
} from "../lib/compliance.ts";
import { complianceWorkbook, complianceWorkbookName } from "../lib/compliance-workbooks.ts";
import { COMPLIANCE_PERMISSIONS, hasPermission } from "../lib/frank.ts";

const monthlySnapshot = {
  kind: "monthly_transactions",
  brokerName: "Frank Demo Securities",
  licenseNumber: "ECMA-CMSP-001",
  month: "July",
  year: 2026,
  includedTrades: 3,
  rows: [
    { category: "Equity (Shares)", domesticRetail: 1250, domesticInstitutional: 5000, foreignRetail: 250, foreignInstitutional: 0 },
    { category: "Fixed Income", domesticRetail: 0, domesticInstitutional: 0, foreignRetail: 0, foreignInstitutional: 0 },
    { category: "ETFs/ETPs", domesticRetail: 0, domesticInstitutional: 0, foreignRetail: 0, foreignInstitutional: 0 },
    { category: "REITS", domesticRetail: 0, domesticInstitutional: 0, foreignRetail: 0, foreignInstitutional: 0 },
    ...Array.from({ length: 6 }, () => ({ category: "Placeholder", domesticRetail: 0, domesticInstitutional: 0, foreignRetail: 0, foreignInstitutional: 0 })),
  ],
};

const complaintsSnapshot = {
  kind: "quarterly_complaints",
  brokerName: "Frank Demo Securities",
  licenseNumber: "ECMA-CMSP-001",
  quarter: "Q3",
  year: 2026,
  summary: { broughtForward: 1, newComplaints: 1, totalUnderReview: 2, resolved: 1, referredSro: 0, referredEcma: 1, closed: 0, pending: 0 },
  complaints: [{
    id: "CASE-001",
    complainant: "Test Investor",
    complainantCategory: "Retail",
    type: "New",
    dateReceived: "2026-07-10",
    details: "Incorrect fee complaint",
    status: "Referred to ECMA",
    statusDate: "2026-07-12",
    comment: "Broker submission reference ECMA-1001",
  }],
};

function workbookFiles(snapshot) {
  return unzipSync(complianceWorkbook(snapshot));
}

test("owned brokerage data maps to the prescribed ECMA classifications", () => {
  assert.equal(isDomesticInvestor("Ethiopia", null), true);
  assert.equal(isDomesticInvestor("Kenya", "Ethiopian"), false);
  assert.equal(isDomesticInvestor(null, null), null);
  assert.equal(investorCategory("individual"), "retail");
  assert.equal(investorCategory("company"), "institutional");
  assert.equal(ecmaInstrumentCategory("equity"), "Equity (Shares)");
  assert.equal(ecmaInstrumentCategory("treasury bond"), "Fixed Income");
  assert.equal(ecmaInstrumentCategory("commodity"), null);
});

test("complaint status and 24-hour clocks are deterministic", () => {
  assert.equal(complaintRegulatoryStatus({ status: "open", regulatoryStatus: "referred_ecma" }), "Referred to ECMA");
  assert.equal(complaintRegulatoryStatus({ status: "resolved" }), "Resolved");
  assert.equal(twentyFourHourDueAt(new Date("2026-08-02T09:30:00.000Z")).toISOString(), "2026-08-03T09:30:00.000Z");
  assert.deepEqual(reportPeriod("2026-07-01", "2026-07-31"), {
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-07-31T00:00:00.000Z"),
  });
  assert.doesNotThrow(() => assertPrescribedReportPeriod("monthly_transactions", new Date("2026-07-01T00:00:00.000Z"), new Date("2026-07-31T00:00:00.000Z")));
  assert.throws(
    () => assertPrescribedReportPeriod("monthly_transactions", new Date("2026-07-02T00:00:00.000Z"), new Date("2026-07-31T00:00:00.000Z")),
    (error) => error instanceof Response && error.status === 400,
  );
  assert.doesNotThrow(() => assertPrescribedReportPeriod("quarterly_complaints", new Date("2026-07-01T00:00:00.000Z"), new Date("2026-09-30T00:00:00.000Z")));
});

test("monthly transaction workbook preserves the prescribed table and profile cells", () => {
  const files = workbookFiles(monthlySnapshot);
  assert.ok(files["[Content_Types].xml"]);
  assert.ok(files["xl/styles.xml"]);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(workbook, /sheet name="Sheet1"/);
  assert.match(sheet, /Monthly Transaction Report/);
  assert.match(sheet, /r="D20"/);
  assert.match(sheet, /Frank Demo Securities/);
  assert.match(sheet, /r="K6"/);
  assert.match(sheet, /IF\(J6=0,0,F6\/J6\)/);
  assert.equal(complianceWorkbookName(monthlySnapshot), "ecma-monthly-transactions-2026-july.xlsx");
});

test("quarterly complaints workbook preserves the prescribed overview and report sheets", () => {
  const files = workbookFiles(complaintsSnapshot);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const overview = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const report = strFromU8(files["xl/worksheets/sheet2.xml"]);
  assert.match(workbook, /sheet name="Overview"/);
  assert.match(workbook, /sheet name="Report"/);
  assert.match(overview, /CMSPs Quarterly Complaints Management Report/);
  assert.match(overview, /r="E16"/);
  assert.match(report, /r="C7"/);
  assert.match(report, /Test Investor/);
  assert.match(report, /Referred to ECMA/);
  assert.equal(complianceWorkbookName(complaintsSnapshot), "ecma-quarterly-complaints-2026-q3.xlsx");
});

test("broker compliance roles own regulatory controls, not the Frank platform administrator", () => {
  assert.equal(hasPermission("compliance", COMPLIANCE_PERMISSIONS.reportReview), true);
  assert.equal(hasPermission("broker_admin", COMPLIANCE_PERMISSIONS.reportSubmit), true);
  assert.equal(hasPermission("operations", COMPLIANCE_PERMISSIONS.reportPrepare), true);
  assert.equal(hasPermission("management", COMPLIANCE_PERMISSIONS.reportSubmit), false);
  assert.equal(hasPermission("super_admin", COMPLIANCE_PERMISSIONS.reportSubmit), false);
});

test("the compliance persistence layer records evidence, approvals, and independent sign-off", async () => {
  const root = new URL("../", import.meta.url);
  const [schema, migration, demoScreeningMigration, seed, reportsUi, clientsUi] = await Promise.all([
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
    readFile(new URL("prisma/migrations/20260802180000_compliance_reporting_controls/migration.sql", root), "utf8"),
    readFile(new URL("prisma/migrations/20260802183000_backfill_demo_screening_evidence/migration.sql", root), "utf8"),
    readFile(new URL("prisma/seed.ts", root), "utf8"),
    readFile(new URL("features/broker/oversight/reporting-screens.tsx", root), "utf8"),
    readFile(new URL("features/broker/clients/client-directory-screen.tsx", root), "utf8"),
  ]);
  assert.match(schema, /model ComplianceReport/);
  assert.match(schema, /model ComplianceEscalation/);
  assert.match(schema, /model ClientScreening/);
  assert.match(migration, /compliance_reports/);
  assert.match(migration, /reviewed_by/);
  assert.match(demoScreeningMigration, /client\."broker_id" = 'brk_abyssinia'/);
  assert.match(demoScreeningMigration, /Frank demo screening fixture/);
  assert.match(demoScreeningMigration, /NOT EXISTS/);
  assert.match(seed, /SCR-DEMO-BACKFILL-cli_pending_ready/);
  assert.match(seed, /Demonstration evidence only/);
  assert.match(reportsUi, /Regulatory returns/);
  assert.match(reportsUi, /24-hour escalations/);
  assert.match(clientsUi, /Sanctions and PEP check/);
  assert.match(clientsUi, /Account statement/);
});
