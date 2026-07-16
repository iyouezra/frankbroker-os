import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the FrankBroker product surface and PostgreSQL model", async () => {
  const [app, investorApp, investorData, investorStyles, adminApp, adminData, adminStyles, layout, styles, clientsApi, reconciliationApi, investorApi, adminApi, tenantApi, ordersApi, orderActionApi, auditApi, orderInput, orderService, tradeService, ledgerService, validationService, settlementService, statusMachine, schema, migration, wiringMigration, omsMigration] = await Promise.all([
    readFile(new URL("app/frankbroker-app.tsx", root), "utf8"),
    readFile(new URL("app/investor/investor-app.tsx", root), "utf8"),
    readFile(new URL("lib/investor-data.ts", root), "utf8"),
    readFile(new URL("app/investor/investor.module.css", root), "utf8"),
    readFile(new URL("app/admin/admin-console.tsx", root), "utf8"),
    readFile(new URL("lib/admin-data.ts", root), "utf8"),
    readFile(new URL("app/admin/admin.module.css", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/api/clients/route.ts", root), "utf8"),
    readFile(new URL("app/api/reconciliation/route.ts", root), "utf8"),
    readFile(new URL("app/api/investor/route.ts", root), "utf8"),
    readFile(new URL("app/api/admin/configuration/route.ts", root), "utf8"),
    readFile(new URL("app/api/tenant/route.ts", root), "utf8"),
    readFile(new URL("app/api/orders/route.ts", root), "utf8"),
    readFile(new URL("app/api/orders/[id]/action/route.ts", root), "utf8"),
    readFile(new URL("app/api/audit/route.ts", root), "utf8"),
    readFile(new URL("lib/order-input.ts", root), "utf8"),
    readFile(new URL("lib/oms/order-service.ts", root), "utf8"),
    readFile(new URL("lib/oms/trade-service.ts", root), "utf8"),
    readFile(new URL("lib/oms/ledger-service.ts", root), "utf8"),
    readFile(new URL("lib/oms/validation-service.ts", root), "utf8"),
    readFile(new URL("lib/oms/settlement-service.ts", root), "utf8"),
    readFile(new URL("lib/oms/status.ts", root), "utf8"),
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
    readFile(new URL("prisma/migrations/20260714130000_init/migration.sql", root), "utf8"),
    readFile(new URL("prisma/migrations/20260714213000_tenant_portal_wiring/migration.sql", root), "utf8"),
    readFile(new URL("prisma/migrations/20260716090000_oms_integrity/migration.sql", root), "utf8"),
  ]);

  assert.match(app, /Good morning, Mekdes/);
  assert.match(app, /Order log/);
  assert.match(app, /Performance/);
  assert.match(app, /Pre-trade validation/);
  assert.match(app, /PRINTABLE CONTRACT NOTE/);
  assert.match(app, /Upload trade confirmations/);
  assert.match(app, /Four-eyes control/);
  assert.match(app, /TELE/);
  assert.match(app, /controls\.allowedOrderTypes/);
  assert.match(app, /controls\.brokerageFeePct/);
  assert.match(app, /features\.manualTradeCapture/);
  assert.doesNotMatch(app, /Instrument master/);
  assert.match(investorApp, /Own a piece of Ethiopia/);
  assert.match(investorApp, /FrankScore 78/);
  assert.match(investorApp, /Review order/);
  assert.match(investorApp, /Open your investment account/);
  assert.match(investorApp, /Fayda ID number \(FIN\)/);
  assert.match(investorApp, /Retail investor/);
  assert.match(investorApp, /Business registration number/);
  assert.match(investorApp, /Live Fayda and tax verification/);
  assert.match(investorData, /"AWAB"/);
  assert.match(investorData, /GB2036/);
  assert.match(investorStyles, /--investor-aqua-400: #35e7d9/);
  assert.match(investorStyles, /@media \(max-width: 900px\)/);
  assert.match(adminApp, /Platform overview/);
  assert.match(adminApp, /Instrument master/);
  assert.match(adminApp, /CAPABILITY FLAGS/);
  assert.match(adminApp, /Maker-checker approval/);
  assert.match(adminData, /fractionalOrders/);
  assert.match(adminData, /Fayda eKYC/);
  assert.match(adminData, /"ABAYB"/);
  assert.match(adminStyles, /--admin-aqua-400: #35e7d9/);
  assert.match(layout, /FrankBroker OS/);
  assert.match(layout, /og\.png/);
  assert.match(styles, /--aqua:/);
  assert.match(styles, /\.client-card\.selected/);
  assert.match(clientsApi, /cashLedgerEntries/);
  assert.match(reconciliationApi, /RECONCILIATION_IMPORTED/);
  assert.match(investorApi, /createSubmittedOrder/);
  assert.match(investorApi, /faydaLast4/);
  assert.doesNotMatch(investorApi, /taxId:\s*tin/);
  assert.match(adminApi, /TENANT_CONFIGURATION_UPDATED/);
  assert.match(adminApi, /brokerInstrument\.upsert/);
  assert.match(tenantApi, /issuer: instrument\.issuer/);
  assert.match(tenantApi, /settlementCycle: instrument\.settlementCycle/);
  assert.match(validationService, /ORDER_TYPE_ALLOWED/);
  assert.match(ordersApi, /ledgerEntries/);
  assert.match(ordersApi, /availableActions/);
  assert.match(orderActionApi, /captureTrade/);
  assert.match(orderActionApi, /settleNextTrade/);
  assert.match(orderActionApi, /generateContractNote/);
  assert.match(auditApi, /prisma\.auditLog\.findMany/);
  assert.match(orderInput, /parsePositiveFiniteNumber/);
  assert.match(orderService, /ORDER_APPROVED/);
  assert.match(orderService, /ORDER_CREATED/);
  assert.match(orderService, /INVESTOR_ORDER_SUBMITTED/);
  assert.match(orderService, /ORDER_VALIDATION_FAILED/);
  assert.match(orderService, /ORDER_REJECTED/);
  assert.match(orderService, /ORDER_CANCELLED/);
  assert.match(orderService, /CONTRACT_NOTE_GENERATED/);
  assert.match(orderService, /CASH_BLOCKED/);
  assert.match(orderService, /CASH_RELEASED/);
  assert.match(orderService, /SECURITIES_BLOCKED/);
  assert.match(orderService, /SECURITIES_RELEASED/);
  assert.match(tradeService, /TRADE_CAPTURED/);
  assert.match(tradeService, /PARTIAL_FILL_RECORDED/);
  assert.match(tradeService, /ORDER_FILLED/);
  assert.match(tradeService, /captureReference/);
  assert.match(ledgerService, /Cash balance invariant failed/);
  assert.match(ledgerService, /Securities balance invariant failed/);
  assert.match(settlementService, /SETTLEMENT_UPDATED/);
  assert.match(statusMachine, /InvalidOrderTransitionError/);
  assert.doesNotMatch(app, /setOrders\(\[\.\.\.persisted, \.\.\.initialOrders/);
  assert.match(schema, /provider = "postgresql"/);
  assert.match(schema, /model Order/);
  assert.match(schema, /model AuditLog/);
  assert.match(schema, /model BrokerSettings/);
  assert.match(schema, /model BrokerInstrument/);
  assert.match(migration, /CREATE TABLE "orders"/);
  assert.match(wiringMigration, /CREATE TABLE "broker_settings"/);
  assert.match(wiringMigration, /CREATE TABLE "tenant_integrations"/);
  assert.match(omsMigration, /orders_status_check/);
  assert.match(omsMigration, /accounts_cash_buckets_check/);
  assert.match(omsMigration, /holdings_quantity_buckets_check/);
  assert.match(omsMigration, /cash_ledger_impact_check/);
  assert.match(omsMigration, /securities_ledger_impact_check/);
  assert.match(omsMigration, /trades_financial_values_check/);
  assert.doesNotMatch(app + layout, /codex-preview|react-loading-skeleton/);
});

test("ships versioned terms, itemized fees, and controlled client requests", async () => {
  const [investorApp, adminApp, brokerApp, investorApi, clientActionApi, feeService, schema, migration] = await Promise.all([
    readFile(new URL("app/investor/investor-app.tsx", root), "utf8"),
    readFile(new URL("app/admin/admin-console.tsx", root), "utf8"),
    readFile(new URL("app/frankbroker-app.tsx", root), "utf8"),
    readFile(new URL("app/api/investor/route.ts", root), "utf8"),
    readFile(new URL("app/api/clients/[id]/action/route.ts", root), "utf8"),
    readFile(new URL("lib/oms/fee-service.ts", root), "utf8"),
    readFile(new URL("prisma/schema.prisma", root), "utf8"),
    readFile(new URL("prisma/migrations/20260716130000_client_terms_fees_requests/migration.sql", root), "utf8"),
  ]);
  assert.match(investorApp, /Proof of address type/);
  assert.match(investorApp, /Total estimated fees/);
  assert.match(investorApp, /Report an order discrepancy/);
  assert.match(adminApp, /VERSIONED FEE SCHEDULE/);
  assert.match(adminApp, /Legal & consent/);
  assert.match(brokerApp, /Requests and discrepancies/);
  assert.match(brokerApp, /Signatory authority/);
  assert.match(investorApi, /disclosureAccepted/);
  assert.match(investorApi, /clientConsent\.create/);
  assert.match(clientActionApi, /CLIENT_ACCOUNT_RESTRICTED/);
  assert.match(clientActionApi, /approve_closure/);
  assert.match(feeService, /computeCumulativeConfiguredFill/);
  assert.match(schema, /model LegalDocument/);
  assert.match(schema, /model FeeSchedule/);
  assert.match(schema, /model ClientServiceRequest/);
  assert.match(migration, /CREATE TABLE "legal_documents"/);
  assert.match(migration, /CREATE TABLE "fee_schedules"/);
  assert.match(migration, /CREATE TABLE "client_service_requests"/);
});
