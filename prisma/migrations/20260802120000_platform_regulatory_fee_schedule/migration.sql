CREATE TABLE "platform_fee_schedules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_fee_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_fee_rules" (
  "id" TEXT NOT NULL,
  "platform_fee_schedule_id" TEXT NOT NULL,
  "asset_class" TEXT NOT NULL,
  "market_segment" TEXT NOT NULL DEFAULT 'main',
  "regulator_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "exchange_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "csd_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
  CONSTRAINT "platform_fee_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_fee_schedules_version_key" ON "platform_fee_schedules"("version");
CREATE INDEX "platform_fee_schedules_status_effective_from_idx" ON "platform_fee_schedules"("status", "effective_from");
CREATE UNIQUE INDEX "platform_fee_rules_platform_fee_schedule_id_asset_class_market_segment_key"
  ON "platform_fee_rules"("platform_fee_schedule_id", "asset_class", "market_segment");

ALTER TABLE "platform_fee_rules"
  ADD CONSTRAINT "platform_fee_rules_platform_fee_schedule_id_fkey"
  FOREIGN KEY ("platform_fee_schedule_id") REFERENCES "platform_fee_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
