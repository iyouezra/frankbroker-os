UPDATE "platform_fee_schedules"
SET "effective_to" = DATE '2026-08-03'
WHERE "status" = 'published'
  AND "effective_from" < DATE '2026-08-04'
  AND ("effective_to" IS NULL OR "effective_to" >= DATE '2026-08-04');

INSERT INTO "platform_fee_schedules" (
  "id", "name", "version", "status", "effective_from", "effective_to", "created_at", "updated_at"
) VALUES (
  'platform_fees_1_2', 'ESX market and regulatory fees', '1.2', 'published', DATE '2026-08-04', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "status" = EXCLUDED."status",
  "effective_from" = EXCLUDED."effective_from",
  "effective_to" = NULL,
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "platform_fee_rules" (
  "id", "platform_fee_schedule_id", "asset_class", "market_segment", "regulator_pct", "exchange_pct", "csd_pct"
) VALUES
  ('platform_fee_1_2_equity_main', 'platform_fees_1_2', 'equity', 'main', 0.15, 0.36, 0),
  ('platform_fee_1_2_bond_main', 'platform_fees_1_2', 'bond', 'main', 0.005, 0.021, 0)
ON CONFLICT ("platform_fee_schedule_id", "asset_class", "market_segment") DO UPDATE SET
  "regulator_pct" = EXCLUDED."regulator_pct",
  "exchange_pct" = EXCLUDED."exchange_pct",
  "csd_pct" = EXCLUDED."csd_pct";
