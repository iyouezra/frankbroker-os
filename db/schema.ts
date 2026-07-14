import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const brokers = sqliteTable("brokers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  licenseNumber: text("license_number").notNull().unique(),
  status: text("status").notNull().default("active"),
  baseCurrency: text("base_currency").notNull().default("ETB"),
  ...timestamps,
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  brokerId: text("broker_id").references(() => brokers.id),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("active"),
  lastLoginAt: text("last_login_at"),
  ...timestamps,
});

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  brokerId: text("broker_id").notNull().references(() => brokers.id),
  clientCode: text("client_code").notNull().unique(),
  fullName: text("full_name").notNull(),
  clientType: text("client_type").notNull().default("individual"),
  phone: text("phone"),
  email: text("email"),
  taxId: text("tax_id"),
  kycStatus: text("kyc_status").notNull().default("pending"),
  riskRating: text("risk_rating").notNull().default("standard"),
  status: text("status").notNull().default("active"),
  ...timestamps,
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id),
  accountNumber: text("account_number").notNull().unique(),
  accountType: text("account_type").notNull().default("cash"),
  currency: text("currency").notNull().default("ETB"),
  totalCash: real("total_cash").notNull().default(0),
  availableCash: real("available_cash").notNull().default(0),
  blockedCash: real("blocked_cash").notNull().default(0),
  unsettledCash: real("unsettled_cash").notNull().default(0),
  status: text("status").notNull().default("active"),
  ...timestamps,
});

export const instruments = sqliteTable("instruments", {
  id: text("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  assetClass: text("asset_class").notNull(),
  issuer: text("issuer").notNull(),
  tradingStatus: text("trading_status").notNull().default("tradable"),
  currency: text("currency").notNull().default("ETB"),
  lotSize: integer("lot_size").notNull().default(1),
  tickSize: real("tick_size").notNull().default(0.01),
  settlementCycle: text("settlement_cycle").notNull().default("T+2"),
  faceValue: real("face_value"),
  maturityDate: text("maturity_date"),
  couponRate: real("coupon_rate"),
  couponFrequency: text("coupon_frequency"),
  lastPrice: real("last_price"),
  ...timestamps,
});

export const holdings = sqliteTable("holdings", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  instrumentId: text("instrument_id").notNull().references(() => instruments.id),
  totalQuantity: real("total_quantity").notNull().default(0),
  availableQuantity: real("available_quantity").notNull().default(0),
  blockedQuantity: real("blocked_quantity").notNull().default(0),
  unsettledQuantity: real("unsettled_quantity").notNull().default(0),
  averageCost: real("average_cost").notNull().default(0),
  ...timestamps,
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  brokerId: text("broker_id").notNull().references(() => brokers.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  instrumentId: text("instrument_id").notNull().references(() => instruments.id),
  side: text("side").notNull(),
  quantity: real("quantity").notNull(),
  price: real("price").notNull(),
  orderType: text("order_type").notNull().default("limit"),
  validity: text("validity").notNull().default("day"),
  estimatedGross: real("estimated_gross").notNull(),
  estimatedFees: real("estimated_fees").notNull(),
  estimatedNet: real("estimated_net").notNull(),
  status: text("status").notNull().default("draft"),
  source: text("source").notNull().default("manual"),
  assignedTraderId: text("assigned_trader_id").references(() => users.id),
  riskFlag: text("risk_flag").notNull().default("none"),
  notes: text("notes"),
  rejectionReason: text("rejection_reason"),
  submittedAt: text("submitted_at"),
  approvedAt: text("approved_at"),
  approvedBy: text("approved_by").references(() => users.id),
  ...timestamps,
});

export const orderValidations = sqliteTable("order_validations", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  ruleCode: text("rule_code").notNull(),
  label: text("label").notNull(),
  result: text("result").notNull(),
  message: text("message"),
  checkedAt: text("checked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const trades = sqliteTable("trades", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  executionPrice: real("execution_price").notNull(),
  quantityFilled: real("quantity_filled").notNull(),
  grossAmount: real("gross_amount").notNull(),
  fees: real("fees").notNull(),
  netAmount: real("net_amount").notNull(),
  tradeDate: text("trade_date").notNull(),
  settlementDate: text("settlement_date").notNull(),
  capturedBy: text("captured_by").notNull().references(() => users.id),
  capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settlements = sqliteTable("settlements", {
  id: text("id").primaryKey(),
  tradeId: text("trade_id").notNull().references(() => trades.id),
  status: text("status").notNull().default("pending"),
  settlementDate: text("settlement_date").notNull(),
  cashStatus: text("cash_status").notNull().default("pending"),
  securitiesStatus: text("securities_status").notNull().default("pending"),
  exceptionNotes: text("exception_notes"),
  confirmedBy: text("confirmed_by").references(() => users.id),
  confirmedAt: text("confirmed_at"),
  ...timestamps,
});

export const cashLedgerEntries = sqliteTable("cash_ledger_entries", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  orderId: text("order_id").references(() => orders.id),
  tradeId: text("trade_id").references(() => trades.id),
  entryType: text("entry_type").notNull(),
  amount: real("amount").notNull(),
  runningBalance: real("running_balance").notNull(),
  description: text("description").notNull(),
  valueDate: text("value_date").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const securitiesLedgerEntries = sqliteTable("securities_ledger_entries", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  instrumentId: text("instrument_id").notNull().references(() => instruments.id),
  orderId: text("order_id").references(() => orders.id),
  tradeId: text("trade_id").references(() => trades.id),
  entryType: text("entry_type").notNull(),
  quantity: real("quantity").notNull(),
  runningQuantity: real("running_quantity").notNull(),
  description: text("description").notNull(),
  valueDate: text("value_date").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reconciliationBatches = sqliteTable("reconciliation_batches", {
  id: text("id").primaryKey(),
  brokerId: text("broker_id").notNull().references(() => brokers.id),
  batchDate: text("batch_date").notNull(),
  fileName: text("file_name"),
  source: text("source").notNull().default("manual_upload"),
  totalRecords: integer("total_records").notNull().default(0),
  matchedRecords: integer("matched_records").notNull().default(0),
  exceptionRecords: integer("exception_records").notNull().default(0),
  status: text("status").notNull().default("processing"),
  uploadedBy: text("uploaded_by").notNull().references(() => users.id),
  ...timestamps,
});

export const reconciliationExceptions = sqliteTable("reconciliation_exceptions", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull().references(() => reconciliationBatches.id),
  reference: text("reference").notNull(),
  exceptionType: text("exception_type").notNull(),
  expectedValue: text("expected_value"),
  actualValue: text("actual_value"),
  status: text("status").notNull().default("open"),
  resolutionNotes: text("resolution_notes"),
  resolvedBy: text("resolved_by").references(() => users.id),
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  brokerId: text("broker_id").references(() => brokers.id),
  actorId: text("actor_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
