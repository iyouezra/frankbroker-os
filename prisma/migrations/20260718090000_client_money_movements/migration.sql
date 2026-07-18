-- Safeguarded pooled client-money accounts and beneficial-owner subledger.
CREATE TABLE "pooled_bank_accounts" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number_masked" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "purpose" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'active',
    "book_balance" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "statement_balance" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "last_reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pooled_bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_money_positions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "pooled_bank_account_id" TEXT NOT NULL,
    "balance" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "client_money_positions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "pooled_bank_account_id" TEXT NOT NULL,
    "submission_reference" TEXT NOT NULL,
    "movement_type" TEXT NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "status" TEXT NOT NULL,
    "bank_reference" TEXT,
    "proof_reference" TEXT,
    "destination_bank_name" TEXT,
    "destination_account_name" TEXT,
    "destination_account_masked" TEXT,
    "requested_by_channel" TEXT NOT NULL,
    "submitted_by_user_id" TEXT,
    "reviewed_by_user_id" TEXT,
    "completed_by_user_id" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "failure_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_money_ledger_entries" (
    "id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "pooled_bank_account_id" TEXT NOT NULL,
    "cash_movement_id" TEXT,
    "order_id" TEXT,
    "trade_id" TEXT,
    "entry_type" TEXT NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "balance_impact" DECIMAL(20,4) NOT NULL,
    "running_balance" DECIMAL(20,4) NOT NULL,
    "created_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_money_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pooled_bank_ledger_entries" (
    "id" TEXT NOT NULL,
    "pooled_bank_account_id" TEXT NOT NULL,
    "cash_movement_id" TEXT,
    "order_id" TEXT,
    "trade_id" TEXT,
    "entry_type" TEXT NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "balance_impact" DECIMAL(20,4) NOT NULL,
    "running_balance" DECIMAL(20,4) NOT NULL,
    "bank_reference" TEXT,
    "created_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pooled_bank_ledger_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cash_ledger_entries" DROP CONSTRAINT "cash_ledger_entries_created_by_fkey";
ALTER TABLE "cash_ledger_entries" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "cash_ledger_entries" ADD COLUMN "cash_movement_id" TEXT;
ALTER TABLE "cash_ledger_entries" ADD COLUMN "pooled_bank_account_id" TEXT;

CREATE UNIQUE INDEX "pooled_bank_accounts_broker_id_bank_name_account_number_masked_key" ON "pooled_bank_accounts"("broker_id", "bank_name", "account_number_masked");
CREATE INDEX "pooled_bank_accounts_broker_id_status_purpose_idx" ON "pooled_bank_accounts"("broker_id", "status", "purpose");
CREATE UNIQUE INDEX "client_money_positions_account_id_pooled_bank_account_id_key" ON "client_money_positions"("account_id", "pooled_bank_account_id");
CREATE INDEX "client_money_positions_pooled_bank_account_id_idx" ON "client_money_positions"("pooled_bank_account_id");
CREATE UNIQUE INDEX "cash_movements_broker_id_submission_reference_key" ON "cash_movements"("broker_id", "submission_reference");
CREATE INDEX "cash_movements_broker_id_status_submitted_at_idx" ON "cash_movements"("broker_id", "status", "submitted_at");
CREATE INDEX "cash_movements_client_id_submitted_at_idx" ON "cash_movements"("client_id", "submitted_at");
CREATE INDEX "cash_movements_account_id_status_idx" ON "cash_movements"("account_id", "status");
CREATE INDEX "client_money_ledger_entries_account_id_created_at_idx" ON "client_money_ledger_entries"("account_id", "created_at");
CREATE INDEX "client_money_ledger_entries_pooled_bank_account_id_created_at_idx" ON "client_money_ledger_entries"("pooled_bank_account_id", "created_at");
CREATE INDEX "client_money_ledger_entries_cash_movement_id_idx" ON "client_money_ledger_entries"("cash_movement_id");
CREATE INDEX "client_money_ledger_entries_order_id_created_at_idx" ON "client_money_ledger_entries"("order_id", "created_at");
CREATE INDEX "client_money_ledger_entries_trade_id_created_at_idx" ON "client_money_ledger_entries"("trade_id", "created_at");
CREATE INDEX "pooled_bank_ledger_entries_pooled_bank_account_id_created_at_idx" ON "pooled_bank_ledger_entries"("pooled_bank_account_id", "created_at");
CREATE INDEX "pooled_bank_ledger_entries_cash_movement_id_idx" ON "pooled_bank_ledger_entries"("cash_movement_id");
CREATE INDEX "pooled_bank_ledger_entries_order_id_created_at_idx" ON "pooled_bank_ledger_entries"("order_id", "created_at");
CREATE INDEX "pooled_bank_ledger_entries_trade_id_created_at_idx" ON "pooled_bank_ledger_entries"("trade_id", "created_at");
CREATE INDEX "cash_ledger_entries_cash_movement_id_created_at_idx" ON "cash_ledger_entries"("cash_movement_id", "created_at");
CREATE INDEX "cash_ledger_entries_pooled_bank_account_id_created_at_idx" ON "cash_ledger_entries"("pooled_bank_account_id", "created_at");

ALTER TABLE "pooled_bank_accounts" ADD CONSTRAINT "pooled_bank_accounts_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_money_positions" ADD CONSTRAINT "client_money_positions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_money_positions" ADD CONSTRAINT "client_money_positions_pooled_bank_account_id_fkey" FOREIGN KEY ("pooled_bank_account_id") REFERENCES "pooled_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_pooled_bank_account_id_fkey" FOREIGN KEY ("pooled_bank_account_id") REFERENCES "pooled_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_money_ledger_entries" ADD CONSTRAINT "client_money_ledger_entries_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "client_money_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_money_ledger_entries" ADD CONSTRAINT "client_money_ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_money_ledger_entries" ADD CONSTRAINT "client_money_ledger_entries_pooled_bank_account_id_fkey" FOREIGN KEY ("pooled_bank_account_id") REFERENCES "pooled_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_money_ledger_entries" ADD CONSTRAINT "client_money_ledger_entries_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_money_ledger_entries" ADD CONSTRAINT "client_money_ledger_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_money_ledger_entries" ADD CONSTRAINT "client_money_ledger_entries_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_money_ledger_entries" ADD CONSTRAINT "client_money_ledger_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pooled_bank_ledger_entries" ADD CONSTRAINT "pooled_bank_ledger_entries_pooled_bank_account_id_fkey" FOREIGN KEY ("pooled_bank_account_id") REFERENCES "pooled_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pooled_bank_ledger_entries" ADD CONSTRAINT "pooled_bank_ledger_entries_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pooled_bank_ledger_entries" ADD CONSTRAINT "pooled_bank_ledger_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pooled_bank_ledger_entries" ADD CONSTRAINT "pooled_bank_ledger_entries_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pooled_bank_ledger_entries" ADD CONSTRAINT "pooled_bank_ledger_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_pooled_bank_account_id_fkey" FOREIGN KEY ("pooled_bank_account_id") REFERENCES "pooled_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
