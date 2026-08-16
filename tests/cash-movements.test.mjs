import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(new URL("../lib/cash-service.ts", import.meta.url), "utf8");
const clientMoneyService = await readFile(new URL("../lib/client-money-service.ts", import.meta.url), "utf8");
const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const investorRoute = await readFile(new URL("../app/api/investor/route.ts", import.meta.url), "utf8");
const cashScreen = await readFile(new URL("../features/broker/cash/cash-operations-screen.tsx", import.meta.url), "utf8");
const proofRoute = await readFile(new URL("../app/api/cash-movements/[id]/proof/route.ts", import.meta.url), "utf8");

test("cash movement workflow is serializable, maker-checker controlled, and evidence gated", () => {
  assert.match(service, /TransactionIsolationLevel\.Serializable/);
  assert.match(service, /Maker-checker control requires another user/);
  assert.match(service, /Only a pending deposit can be verified/);
  assert.match(service, /Bank evidence reference is required before crediting a deposit/);
  assert.match(service, /Only an approved withdrawal can be marked paid/);
  assert.match(service, /Payment bank reference is required/);
});

test("pooled bank and investor beneficial ledgers are linked to the same movement", () => {
  // Both books move through the single choke point, which always writes the
  // beneficial and pooled rows together and carries the movement id onto each.
  assert.match(clientMoneyService, /export async function persistClientMoneyMutation/);
  assert.match(clientMoneyService, /clientMoneyLedgerEntry\.create/);
  assert.match(clientMoneyService, /pooledBankLedgerEntry\.create/);
  assert.match(clientMoneyService, /cashMovementId: input\.cashMovementId \?\? null/);
  assert.match(service, /persistClientMoneyMutation/);
  assert.match(service, /DEPOSIT_VERIFIED_AND_CREDITED/);
  assert.match(service, /WITHDRAWAL_PAID_AND_DEBITED/);
  assert.match(schema, /model PooledBankAccount/);
  assert.match(schema, /model ClientMoneyPosition/);
  assert.match(schema, /model ClientMoneyLedgerEntry/);
  assert.match(schema, /model PooledBankLedgerEntry/);
});

test("client-money books can only be written through the choke point", () => {
  // No service may write the beneficial or pooled ledgers directly; routing
  // everything through persistClientMoneyMutation is what keeps the two books
  // and the general ledger from drifting apart.
  for (const [name, source] of [["cash-service", service]]) {
    assert.doesNotMatch(source, /clientMoneyLedgerEntry\.create/, `${name} must not write the beneficial ledger directly`);
    assert.doesNotMatch(source, /pooledBankLedgerEntry\.create/, `${name} must not write the pooled ledger directly`);
  }
  // Deposit verification and withdrawal payment are the only two cash-desk
  // events that move the client-money books.
  assert.equal((service.match(/persistClientMoneyMutation\(/g) ?? []).length, 2);
});

test("trade cash impacts remain synchronized with beneficial and pooled books", () => {
  assert.match(clientMoneyService, /applyClientMoneyTradeBook/);
  assert.match(clientMoneyService, /confirmClientMoneyTradeAtSettlement/);
  assert.match(clientMoneyService, /CLIENT_MONEY_TRADE_BOOK_UPDATED/);
  assert.match(clientMoneyService, /POOLED_BANK_SETTLEMENT_CONFIRMED/);
});

test("investor cash submission is a dedicated controlled action", () => {
  assert.match(investorRoute, /payload\.action === "cash_movement"/);
  assert.match(investorRoute, /submitInvestorCashMovement/);
});

test("deposit receipts are stored and visible with submitted details during officer review", () => {
  assert.match(schema, /model CashMovementProof/);
  assert.match(service, /prepareCashMovementProof/);
  assert.match(investorRoute, /formData\?\.get\("attachment0"\)/);
  assert.match(cashScreen, /View uploaded receipt/);
  assert.match(cashScreen, /Submission reference/);
  assert.match(proofRoute, /requireTenantModule\(request, "dealer_operations", "report"\)/);
  assert.match(proofRoute, /cashMovement: \{ brokerId: actor\.brokerId \}/);
});
