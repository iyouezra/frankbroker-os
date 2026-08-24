CREATE TABLE "commission_promotions" (
  "id" TEXT NOT NULL,
  "fee_schedule_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "eligibility" TEXT NOT NULL DEFAULT 'all_clients',
  "starts_on" DATE NOT NULL,
  "ends_on" DATE NOT NULL,
  "new_client_window_days" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_promotions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_promotions_valid_dates" CHECK ("ends_on" >= "starts_on"),
  CONSTRAINT "commission_promotions_valid_eligibility" CHECK ("eligibility" IN ('all_clients', 'new_clients')),
  CONSTRAINT "commission_promotions_valid_window" CHECK (
    ("eligibility" = 'all_clients' AND "new_client_window_days" IS NULL)
    OR ("eligibility" = 'new_clients' AND "new_client_window_days" > 0)
  )
);

CREATE INDEX "commission_promotions_fee_schedule_id_starts_on_ends_on_idx"
  ON "commission_promotions"("fee_schedule_id", "starts_on", "ends_on");

ALTER TABLE "commission_promotions"
  ADD CONSTRAINT "commission_promotions_fee_schedule_id_fkey"
  FOREIGN KEY ("fee_schedule_id") REFERENCES "fee_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
