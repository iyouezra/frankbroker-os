-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_class" TEXT NOT NULL,
    "normal_balance" TEXT NOT NULL,
    "statement_caption" TEXT NOT NULL,
    "external_account_code" TEXT,
    "sub_ledger" TEXT,
    "posting_enabled" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "balance" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "debit_total" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "credit_total" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "value_date" DATE NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "total_debit" DECIMAL(20,4) NOT NULL,
    "total_credit" DECIMAL(20,4) NOT NULL,
    "reason" TEXT,
    "posted_by" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "reverses_entry_id" TEXT,
    "reversal_reason" TEXT,
    "order_id" TEXT,
    "trade_id" TEXT,
    "settlement_id" TEXT,
    "cash_movement_id" TEXT,
    "account_id" TEXT,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "ledger_account_id" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "running_balance" DECIMAL(20,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "memo" TEXT NOT NULL,
    "client_account_id" TEXT,
    "pooled_bank_account_id" TEXT,
    "instrument_id" TEXT,
    "value_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_broker_id_role_key" ON "ledger_accounts"("broker_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_broker_id_code_key" ON "ledger_accounts"("broker_id", "code");

-- CreateIndex
CREATE INDEX "ledger_accounts_broker_id_account_class_code_idx" ON "ledger_accounts"("broker_id", "account_class", "code");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reverses_entry_id_key" ON "journal_entries"("reverses_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_broker_id_idempotency_key_key" ON "journal_entries"("broker_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "journal_entries_broker_id_value_date_idx" ON "journal_entries"("broker_id", "value_date");

-- CreateIndex
CREATE INDEX "journal_entries_broker_id_source_type_source_id_idx" ON "journal_entries"("broker_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "journal_entries_trade_id_idx" ON "journal_entries"("trade_id");

-- CreateIndex
CREATE INDEX "journal_entries_cash_movement_id_idx" ON "journal_entries"("cash_movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_lines_entry_id_line_number_key" ON "journal_lines"("entry_id", "line_number");

-- CreateIndex
CREATE INDEX "journal_lines_ledger_account_id_value_date_idx" ON "journal_lines"("ledger_account_id", "value_date");

-- CreateIndex
CREATE INDEX "journal_lines_broker_id_value_date_idx" ON "journal_lines"("broker_id", "value_date");

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reverses_entry_id_fkey" FOREIGN KEY ("reverses_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_client_account_id_fkey" FOREIGN KEY ("client_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_pooled_bank_account_id_fkey" FOREIGN KEY ("pooled_bank_account_id") REFERENCES "pooled_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only enforcement.
--
-- Correcting a posted journal entry means posting its reversal, never editing
-- or deleting it. The application already works this way; these triggers make
-- it a property of the database, so an ad-hoc psql session or a future code
-- path cannot quietly rewrite history.

-- Journal lines are fully immutable once written.
CREATE OR REPLACE FUNCTION journal_lines_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'journal_lines are immutable; post a reversing entry instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_lines_append_only
  BEFORE UPDATE OR DELETE ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION journal_lines_append_only();

-- Journal entries may never be deleted. They may only be updated to record the
-- reversal linkage and workflow state; every financial and provenance field is
-- frozen at posting time.
CREATE OR REPLACE FUNCTION journal_entries_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'journal_entries are append-only; post a reversing entry instead';
  END IF;
  IF (
    NEW.broker_id, NEW.entry_date, NEW.value_date, NEW.source_type, NEW.source_id,
    NEW.idempotency_key, NEW.currency, NEW.total_debit, NEW.total_credit,
    NEW.posted_by, NEW.posted_at, NEW.order_id, NEW.trade_id, NEW.settlement_id,
    NEW.cash_movement_id, NEW.account_id
  ) IS DISTINCT FROM (
    OLD.broker_id, OLD.entry_date, OLD.value_date, OLD.source_type, OLD.source_id,
    OLD.idempotency_key, OLD.currency, OLD.total_debit, OLD.total_credit,
    OLD.posted_by, OLD.posted_at, OLD.order_id, OLD.trade_id, OLD.settlement_id,
    OLD.cash_movement_id, OLD.account_id
  ) THEN
    RAISE EXCEPTION 'journal entry financial fields are immutable; post a reversing entry instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_append_only
  BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION journal_entries_append_only();
