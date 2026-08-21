import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildProtectedClientMoneyCoverage, buildSettlementCoverage } from "../lib/gl/ledger-reporting.ts";
import { processReconciliationBatch } from "../lib/reconciliation-service.ts";
import { D } from "../lib/money.ts";

const row = (role, balance, code = role) => ({ role, balance, code, name: role });

test("protected client money excludes gateway and settlement receivables", () => {
  const trialBalance = { rows: [
    row("client_money_pooled_bank", 90, "1010"),
    row("client_money_gateway", 10, "1015"),
    row("settlement_receivable", 25, "1050"),
    row("client_money_payable_settled", -100, "2010"),
    row("client_money_payable_unsettled", -20, "2020"),
    row("unidentified_receipts", -5, "2040"),
  ] };
  const protectedMoney = buildProtectedClientMoneyCoverage(trialBalance);
  const settlement = buildSettlementCoverage(trialBalance);
  assert.deepEqual({ held: protectedMoney.held, owed: protectedMoney.owed, surplus: protectedMoney.surplus }, { held: 90, owed: 105, surplus: -15 });
  assert.equal(settlement.held, 125);
  assert.equal(settlement.owed, 125);
});

test("an omitted active pooled account becomes a reconciliation exception", async () => {
  let created;
  const pools = [
    { id: "POOL-1", accountNumberMasked: "•• 1", bookBalance: D(10), positions: [] },
    { id: "POOL-2", accountNumberMasked: "•• 2", bookBalance: D(20), positions: [] },
  ];
  const db = {
    businessDayControl: { findUnique: async () => null },
    reconciliationBatch: { findFirst: async () => null },
    pooledBankAccount: { findMany: async () => pools },
    $transaction: async (callback) => callback({
      reconciliationBatch: { create: async ({ data }) => { created = data; return { id: data.id, ...data }; } },
      auditLog: { create: async () => ({}) },
    }),
  };
  const result = await processReconciliationBatch({
    db, brokerId: "BRK", actorId: "USR", fileName: "bank.csv", feedType: "bank_balances",
    businessDate: new Date("2026-08-21T00:00:00.000Z"),
    rows: [{ reference: "POOL-1", type: "bank_balance", actualValue: "10" }],
  });
  assert.equal(result.totalRecords, 2);
  assert.equal(result.exceptionRecords, 1);
  assert.equal(created.exceptions.create[0].exceptionType, "missing_external_bank_balance");
  assert.equal(created.exceptions.create[0].reference, "POOL-2");
});

test("payment evidence and accounting policy additions stay narrow", async () => {
  const [schema, migration, providerService, operations, policy] = await Promise.all([
    readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../prisma/migrations/20260821120000_payment_controls_accounting_policy/migration.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/payment-provider-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/client-money-operations-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/accounting-policy.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /model PaymentProviderEvent/);
  assert.match(schema, /model AccountingPolicyVersion/);
  assert.match(migration, /provider_event_id/);
  assert.match(providerService, /providerStatus !== "bank_settled"/);
  assert.match(providerService, /clientMoneyFunded/);
  for (const builder of ["unidentifiedReceiptRecorded", "unidentifiedReceiptAllocated", "brokerFeesSwept", "feeRemitted", "clientMoneyFunded"]) assert.match(operations, new RegExp(builder));
  assert.match(policy, /confirmed_designated_bank_cash_only/);
});
