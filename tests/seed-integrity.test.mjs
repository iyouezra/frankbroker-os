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

test("the seeded book reconciles: a captured trade actually moved the cash", async () => {
  const seed = await readFile(new URL("../prisma/seed.ts", import.meta.url), "utf8");
  const num = (pattern, label) => {
    const match = seed.match(pattern);
    assert.ok(match, `could not find ${label} in the seed`);
    return Number(match[1].replaceAll("_", ""));
  };

  // ORD-2026-1046 is captured but unsettled: the client paid consideration plus
  // fees, and holds the bond as unsettled quantity. If the seed hands out the
  // securities without taking the cash, the opening general ledger cannot
  // balance and every reconciliation starts life with a phantom break.
  const tradeNet = num(/id: "TRD-2026-0772"[^}]*?netAmount: ([\d_.]+)/, "trade net amount");
  const accountTotal = num(/id: "acc_blue"[^}]*?totalCash: ([\d_.]+)/, "acc_blue total cash");
  const accountAvailable = num(/id: "acc_blue"[^}]*?availableCash: ([\d_.]+)/, "acc_blue available cash");
  const accountBlocked = num(/id: "acc_blue"[^}]*?blockedCash: ([\d_.]+)/, "acc_blue blocked cash");
  const positionBalance = num(/id: "pos_blue_general"[^}]*?balance: ([\d_.]+)/, "pos_blue_general balance");
  const poolBook = num(/id: "pool_aby_general"[^}]*?bookBalance: ([\d_.]+)/, "pool book balance");
  const poolStatement = num(/id: "pool_aby_general"[^}]*?statementBalance: ([\d_.]+)/, "pool statement balance");

  assert.equal(accountAvailable + accountBlocked, accountTotal, "cash invariant must hold on the account");
  assert.equal(positionBalance, accountTotal, "beneficial position must match the account's cash");
  // The book already reflects the purchase; the bank statement will not until
  // settlement. That gap is the trade in flight, and it is exactly the net.
  assert.equal(Number((poolStatement - poolBook).toFixed(2)), tradeNet, "pool book-to-statement gap must equal the unsettled trade");
});

test("every seeded broker gets its chart of control accounts before anything can post", async () => {
  const seed = await readFile(new URL("../prisma/seed.ts", import.meta.url), "utf8");

  assert.match(seed, /ensureChartOfAccounts/);
  // The chart must exist before the first trade or cash movement is seeded,
  // otherwise a posting would arrive with nowhere to land.
  const chartCall = seed.indexOf("ensureChartOfAccounts(prisma");
  assert.ok(chartCall > 0, "seed must create the chart for each broker");
  assert.ok(chartCall < seed.indexOf("prisma.trade.createMany"), "chart must be seeded before trades");
  assert.ok(chartCall < seed.indexOf("prisma.cashMovement"), "chart must be seeded before cash movements");
});
