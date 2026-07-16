-- Explicit order aggregates and reservation ownership make partial fills
-- reconcilable without deriving mutable financial state from loosely related rows.
ALTER TABLE "accounts" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "holdings" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "orders"
  ADD COLUMN "submission_reference" TEXT,
  ADD COLUMN "filled_quantity" DECIMAL(24,8) NOT NULL DEFAULT 0,
  ADD COLUMN "remaining_quantity" DECIMAL(24,8) NOT NULL DEFAULT 0,
  ADD COLUMN "average_fill_price" DECIMAL(20,6),
  ADD COLUMN "executed_gross" DECIMAL(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN "executed_fees" DECIMAL(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN "executed_net" DECIMAL(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN "blocked_cash" DECIMAL(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN "blocked_quantity" DECIMAL(24,8) NOT NULL DEFAULT 0,
  ADD COLUMN "contract_note_number" TEXT,
  ADD COLUMN "contract_note_generated_at" TIMESTAMP(3),
  ADD COLUMN "contract_note_generated_by" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "trades" ADD COLUMN "capture_reference" TEXT;
CREATE UNIQUE INDEX "trades_capture_reference_key" ON "trades"("capture_reference");

UPDATE "orders" o
SET
  "filled_quantity" = COALESCE(t."filled", 0),
  "remaining_quantity" = GREATEST(o."quantity" - COALESCE(t."filled", 0), 0),
  "average_fill_price" = CASE WHEN COALESCE(t."filled", 0) > 0 THEN t."gross" / t."filled" ELSE NULL END,
  "executed_gross" = COALESCE(t."gross", 0),
  "executed_fees" = COALESCE(t."fees", 0),
  "executed_net" = COALESCE(t."net", 0),
  "blocked_cash" = CASE
    WHEN o."side" = 'buy' AND o."status" IN ('pending_broker_review', 'approved', 'partially_filled') THEN
      ROUND(o."estimated_net" * GREATEST(o."quantity" - COALESCE(t."filled", 0), 0) / NULLIF(o."quantity", 0), 4)
    ELSE 0
  END,
  "blocked_quantity" = CASE
    WHEN o."side" = 'sell' AND o."status" IN ('pending_broker_review', 'approved', 'partially_filled') THEN
      GREATEST(o."quantity" - COALESCE(t."filled", 0), 0)
    ELSE 0
  END
FROM (
  SELECT
    "order_id",
    SUM("quantity_filled") AS "filled",
    SUM("gross_amount") AS "gross",
    SUM("fees") AS "fees",
    SUM("net_amount") AS "net"
  FROM "trades"
  GROUP BY "order_id"
) t
WHERE t."order_id" = o."id";

UPDATE "orders"
SET
  "remaining_quantity" = "quantity",
  "blocked_cash" = CASE WHEN "side" = 'buy' AND "status" IN ('pending_broker_review', 'approved') THEN "estimated_net" ELSE "blocked_cash" END,
  "blocked_quantity" = CASE WHEN "side" = 'sell' AND "status" IN ('pending_broker_review', 'approved') THEN "quantity" ELSE "blocked_quantity" END
WHERE "filled_quantity" = 0;

CREATE UNIQUE INDEX "orders_contract_note_number_key" ON "orders"("contract_note_number");
CREATE UNIQUE INDEX "orders_broker_id_submission_reference_key" ON "orders"("broker_id", "submission_reference");

ALTER TABLE "cash_ledger_entries"
  ADD COLUMN "total_impact" DECIMAL(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN "available_impact" DECIMAL(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN "blocked_impact" DECIMAL(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN "unsettled_impact" DECIMAL(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN "reason" TEXT;

ALTER TABLE "securities_ledger_entries"
  ADD COLUMN "total_impact" DECIMAL(24,8) NOT NULL DEFAULT 0,
  ADD COLUMN "available_impact" DECIMAL(24,8) NOT NULL DEFAULT 0,
  ADD COLUMN "blocked_impact" DECIMAL(24,8) NOT NULL DEFAULT 0,
  ADD COLUMN "unsettled_impact" DECIMAL(24,8) NOT NULL DEFAULT 0,
  ADD COLUMN "reason" TEXT;

ALTER TABLE "audit_logs" ADD COLUMN "reason" TEXT;

CREATE INDEX "cash_ledger_entries_order_id_created_at_idx" ON "cash_ledger_entries"("order_id", "created_at");
CREATE INDEX "cash_ledger_entries_trade_id_created_at_idx" ON "cash_ledger_entries"("trade_id", "created_at");
CREATE INDEX "securities_ledger_entries_order_id_created_at_idx" ON "securities_ledger_entries"("order_id", "created_at");
CREATE INDEX "securities_ledger_entries_trade_id_created_at_idx" ON "securities_ledger_entries"("trade_id", "created_at");

UPDATE "orders" SET "status" = 'approved' WHERE "status" = 'sent_to_esx_manually';
UPDATE "orders" SET "status" = 'cancelled' WHERE "status" = 'expired';
UPDATE "securities_ledger_entries" SET "entry_type" = 'buy_credit' WHERE "entry_type" = 'trade_receipt';
UPDATE "securities_ledger_entries" SET "entry_type" = 'sell_debit' WHERE "entry_type" = 'trade_delivery';

ALTER TABLE "orders" ADD CONSTRAINT "orders_status_check" CHECK (
  "status" IN (
    'draft',
    'submitted',
    'validation_failed',
    'pending_broker_review',
    'approved',
    'rejected',
    'cancelled',
    'partially_filled',
    'filled',
    'settlement_pending',
    'settled',
    'failed'
  )
);

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_cash_nonnegative_check" CHECK (
  "total_cash" >= 0 AND "available_cash" >= 0 AND "blocked_cash" >= 0 AND "unsettled_cash" >= 0
);

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_cash_buckets_check" CHECK (
  "total_cash" = "available_cash" + "blocked_cash" + "unsettled_cash"
);

ALTER TABLE "holdings" ADD CONSTRAINT "holdings_quantity_nonnegative_check" CHECK (
  "total_quantity" >= 0 AND "available_quantity" >= 0 AND "blocked_quantity" >= 0 AND "unsettled_quantity" >= 0
);

ALTER TABLE "holdings" ADD CONSTRAINT "holdings_quantity_buckets_check" CHECK (
  "total_quantity" = "available_quantity" + "blocked_quantity" + "unsettled_quantity"
);

ALTER TABLE "orders" ADD CONSTRAINT "orders_fill_quantities_check" CHECK (
  "quantity" > 0
  AND "filled_quantity" >= 0
  AND "remaining_quantity" >= 0
  AND "filled_quantity" + "remaining_quantity" = "quantity"
);

ALTER TABLE "orders" ADD CONSTRAINT "orders_reservations_nonnegative_check" CHECK (
  "blocked_cash" >= 0 AND "blocked_quantity" >= 0
);

ALTER TABLE "orders" ADD CONSTRAINT "orders_financial_values_check" CHECK (
  "side" IN ('buy', 'sell')
  AND "price" > 0
  AND "estimated_gross" >= 0
  AND "estimated_fees" >= 0
  AND "estimated_net" >= 0
  AND "executed_gross" >= 0
  AND "executed_fees" >= 0
  AND "executed_net" >= 0
);

ALTER TABLE "trades" ADD CONSTRAINT "trades_financial_values_check" CHECK (
  "execution_price" > 0
  AND "quantity_filled" > 0
  AND "gross_amount" > 0
  AND "fees" >= 0
  AND "net_amount" > 0
);

ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_entry_type_check" CHECK (
  "entry_type" IN ('deposit', 'withdrawal', 'block', 'release', 'trade_debit', 'trade_credit', 'fee', 'adjustment')
);

ALTER TABLE "cash_ledger_entries" ADD CONSTRAINT "cash_ledger_impact_check" CHECK (
  "total_impact" = "available_impact" + "blocked_impact" + "unsettled_impact"
);

ALTER TABLE "securities_ledger_entries" ADD CONSTRAINT "securities_ledger_entry_type_check" CHECK (
  "entry_type" IN ('block', 'release', 'buy_credit', 'sell_debit', 'adjustment')
);

ALTER TABLE "securities_ledger_entries" ADD CONSTRAINT "securities_ledger_impact_check" CHECK (
  "total_impact" = "available_impact" + "blocked_impact" + "unsettled_impact"
);
