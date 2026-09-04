import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("investor deposits use a linked-bank gateway flow without manual evidence", async () => {
  const [sheet, english, investorRoute, cashService] = await Promise.all([
    readFile(new URL("features/investor/cash/cash-sheet.tsx", root), "utf8"),
    readFile(new URL("lib/i18n/en.ts", root), "utf8"),
    readFile(new URL("app/api/investor/route.ts", root), "utf8"),
    readFile(new URL("lib/cash-service.ts", root), "utf8"),
  ]);

  assert.doesNotMatch(sheet, /receiptUploadId|type="file"|setBankReference|setProofReference/);
  assert.match(sheet, /cash\.continueToPayment/);
  assert.match(sheet, /cash\.gatewayConfirmNote/);
  assert.match(sheet, /sourceLinkedBankAccountId: type === "deposit" \? selectedBank\?\.id : undefined/);
  assert.match(sheet, /cash\.payFromBank/);
  assert.match(english, /Money is added only after the payment is confirmed\./);
  assert.doesNotMatch(english, /No transfer reference or receipt upload needed/);
  assert.match(investorRoute, /sourceLinkedBankAccountId: String\(payload\.sourceLinkedBankAccountId/);
  assert.match(cashService, /channel === "investor_portal" && !input\.sourceLinkedBankAccountId/);
  assert.match(cashService, /input\.sourceLinkedBankAccountId && !sourceLinkedBank/);
});

test("withdrawals still require an approved linked destination", async () => {
  const sheet = await readFile(new URL("features/investor/cash/cash-sheet.tsx", root), "utf8");

  assert.match(sheet, /linkedBanks\.filter\(\(account\) => account\.status === "approved"\)/);
  assert.match(sheet, /cash\.destinationBank/);
  assert.match(sheet, /cash\.requestWithdrawal/);
});
