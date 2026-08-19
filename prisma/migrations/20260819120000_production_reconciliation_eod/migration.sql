ALTER TABLE "reconciliation_batches"
  ADD COLUMN "feed_type" TEXT NOT NULL DEFAULT 'esx_executions',
  ADD COLUMN "content_hash" TEXT,
  ADD COLUMN "input_rows" JSONB,
  ADD COLUMN "control_totals" JSONB,
  ADD COLUMN "attempt_number" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "supersedes_batch_id" TEXT;

CREATE UNIQUE INDEX "reconciliation_batches_supersedes_batch_id_key"
  ON "reconciliation_batches"("supersedes_batch_id");
CREATE UNIQUE INDEX "reconciliation_batches_broker_id_batch_date_feed_type_content_key"
  ON "reconciliation_batches"("broker_id", "batch_date", "feed_type", "content_hash", "attempt_number");
CREATE INDEX "reconciliation_batches_broker_id_batch_date_feed_type_status_idx"
  ON "reconciliation_batches"("broker_id", "batch_date", "feed_type", "status");

ALTER TABLE "reconciliation_batches"
  ADD CONSTRAINT "reconciliation_batches_supersedes_batch_id_fkey"
  FOREIGN KEY ("supersedes_batch_id") REFERENCES "reconciliation_batches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "business_day_controls" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "business_date" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "cutoff_at" TIMESTAMP(3),
  "close_evidence" TEXT,
  "closed_by" TEXT,
  "closed_at" TIMESTAMP(3),
  "reopen_reason" TEXT,
  "reopened_by" TEXT,
  "reopened_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_day_controls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "business_day_controls_status_check" CHECK ("status" IN ('open', 'reopened', 'closed'))
);

CREATE UNIQUE INDEX "business_day_controls_broker_id_business_date_key"
  ON "business_day_controls"("broker_id", "business_date");
CREATE INDEX "business_day_controls_broker_id_status_business_date_idx"
  ON "business_day_controls"("broker_id", "status", "business_date");

ALTER TABLE "business_day_controls"
  ADD CONSTRAINT "business_day_controls_broker_id_fkey"
  FOREIGN KEY ("broker_id") REFERENCES "brokers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_day_controls"
  ADD CONSTRAINT "business_day_controls_closed_by_fkey"
  FOREIGN KEY ("closed_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_day_controls"
  ADD CONSTRAINT "business_day_controls_reopened_by_fkey"
  FOREIGN KEY ("reopened_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
