import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("investor records have real workflows instead of placeholder actions", async () => {
  const [profile, sheets] = await Promise.all([
    source("features/investor/profile/profile-screen.tsx"),
    source("features/investor/profile/profile-workflow-sheets.tsx"),
  ]);
  assert.match(profile, /PLACEHOLDER_MENU = \["profile\.helpAmharic"\]/);
  assert.match(profile, /StatementsTaxSheet/);
  assert.match(profile, /SecuritySheet/);
  assert.match(sheets, /Select an order/);
  assert.match(sheets, /Supporting evidence \(optional\)/);
  assert.match(sheets, /Current value/);
  assert.match(sheets, /Correct value/);
});

test("investor statements and service requests stay tenant scoped and broker linked", async () => {
  const [statementRoute, investorRoute, threadService] = await Promise.all([
    source("app/api/investor/statements/route.ts"),
    source("app/api/investor/route.ts"),
    source("lib/crm/thread-service.ts"),
  ]);
  assert.match(statementRoute, /resolveInvestorContext\(request\)/);
  assert.match(statementRoute, /buildClientStatementSnapshot/);
  assert.match(statementRoute, /INVESTOR_STATEMENT_DOWNLOADED/);
  assert.match(investorRoute, /"tax_document", "security_concern"/);
  assert.match(investorRoute, /threadId: item\.threadId/);
  assert.match(investorRoute, /attachments,/);
  assert.match(threadService, /attachments: input\.attachments/);
});

test("request history opens the linked conversation and displays broker outcomes", async () => {
  const [profile, app] = await Promise.all([
    source("features/investor/profile/profile-screen.tsx"),
    source("app/investor/investor-app.tsx"),
  ]);
  assert.match(profile, /Outcome: \{item\.resolutionNotes\}/);
  assert.match(profile, /onOpenRequest\(item\.threadId\)/);
  assert.match(app, /setSupportOpen\(true\); void openSupportThread\(threadId\)/);
});
