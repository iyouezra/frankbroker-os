import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  expectedDocumentTypes,
  maskBankAccount,
  normalizeBankAccountNumber,
  parseLinkedBanks,
  prepareDocument,
  validateBankHolderName,
} from "../lib/onboarding-evidence.ts";

test("document requirements follow the client type", () => {
  assert.deepEqual(expectedDocumentTypes("individual"), ["proof_of_address"]);
  assert.deepEqual(expectedDocumentTypes("corporate"), [
    "business_license",
    "tin_certificate",
    "certificate_of_incorporation",
    "article_of_association",
  ]);
  assert.deepEqual(expectedDocumentTypes("institution"), expectedDocumentTypes("corporate"));
});

test("bank account values are normalized and only the last six characters are exposed", () => {
  assert.equal(normalizeBankAccountNumber("1000 5789 4108"), "100057894108");
  assert.equal(maskBankAccount("100057894108"), "•••••• 894108");
  assert.equal(maskBankAccount("4108"), "•••••• 4108");
});

test("linked banks enforce count, uniqueness, and holder-name matching", () => {
  const banks = parseLinkedBanks(JSON.stringify([
    { bankName: "Commercial Bank of Ethiopia", accountNumber: "100057894108", accountHolderName: "Selam Mekonnen" },
    { bankName: "Awash Bank", accountNumber: "0132098765432", accountHolderName: "Selam Mekonnen" },
  ]));
  assert.equal(banks.length, 2);
  assert.doesNotThrow(() => validateBankHolderName(banks, "selam mekonnen"));
  assert.throws(() => parseLinkedBanks([]));
  assert.throws(() => parseLinkedBanks([banks[0], banks[0]]));
  assert.throws(() => validateBankHolderName(banks, "Different Name"));
});

test("document validation accepts matching PDF content and rejects a false signature", async () => {
  const valid = new File([Buffer.from("%PDF-1.4\n%%EOF")], "identity.pdf", { type: "application/pdf" });
  const prepared = await prepareDocument("proof_of_address", valid);
  assert.equal(prepared.originalName, "identity.pdf");
  assert.equal(prepared.mimeType, "application/pdf");
  assert.equal(prepared.sizeBytes, valid.size);

  const invalid = new File([Buffer.from("plain text")], "identity.pdf", { type: "application/pdf" });
  await assert.rejects(() => prepareDocument("proof_of_address", invalid));
});

test("document access is tenant scoped and linked bank responses stay masked", async () => {
  const documentRoute = await readFile(new URL("../app/api/clients/[id]/documents/[documentId]/route.ts", import.meta.url), "utf8");
  const evidenceService = await readFile(new URL("../lib/onboarding-evidence.ts", import.meta.url), "utf8");
  const serializedBankBody = evidenceService.slice(evidenceService.indexOf("export function serializeLinkedBank")).split("return {")[1];
  assert.match(documentRoute, /brokerId: actor\.brokerId/);
  assert.match(documentRoute, /requirePermission\(request, "report"\)/);
  assert.doesNotMatch(serializedBankBody, /\n\s+accountNumber:/);
  assert.match(serializedBankBody, /accountNumberMasked: maskBankAccount/);
});

test("investor withdrawals resolve an approved bank on the server", async () => {
  const cashService = await readFile(new URL("../lib/cash-service.ts", import.meta.url), "utf8");
  assert.match(cashService, /status: "approved"/);
  assert.match(cashService, /clientId: client\.id/);
  assert.match(cashService, /linkedBankAccountId: linkedBank\?\.id/);
});
