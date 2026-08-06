import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("repeatable seed resolves Selam's linked bank by ownership before creating cash movements", async () => {
  const seed = await readFile(new URL("../prisma/seed.ts", import.meta.url), "utf8");

  assert.match(seed, /clientId_bankName_accountNumber/);
  assert.match(seed, /const investorCbeBank = await prisma\.linkedBankAccount\.upsert/);
  assert.match(seed, /linkedBankAccountId: investorCbeBank\.id/);
  assert.doesNotMatch(seed, /linkedBankAccountId: "BANK-INVESTOR-CBE"/);
});
