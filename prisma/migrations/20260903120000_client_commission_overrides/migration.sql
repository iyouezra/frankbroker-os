ALTER TABLE "client_trading_mandates"
  ADD COLUMN "commission_rate_pct" DECIMAL(8,4),
  ADD COLUMN "commission_minimum_fee" DECIMAL(20,4),
  ADD COLUMN "commission_maximum_fee" DECIMAL(20,4),
  ADD COLUMN "commission_effective_from" DATE,
  ADD COLUMN "commission_reason" TEXT;

ALTER TABLE "client_trading_mandates"
  ADD CONSTRAINT "client_trading_mandates_commission_source_check"
    CHECK ("commission_source" IN ('tenant_default', 'client_override')),
  ADD CONSTRAINT "client_trading_mandates_commission_rate_check"
    CHECK ("commission_rate_pct" IS NULL OR ("commission_rate_pct" >= 0 AND "commission_rate_pct" <= 100)),
  ADD CONSTRAINT "client_trading_mandates_commission_minimum_check"
    CHECK ("commission_minimum_fee" IS NULL OR "commission_minimum_fee" >= 0),
  ADD CONSTRAINT "client_trading_mandates_commission_maximum_check"
    CHECK ("commission_maximum_fee" IS NULL OR "commission_maximum_fee" >= 0),
  ADD CONSTRAINT "client_trading_mandates_commission_range_check"
    CHECK ("commission_maximum_fee" IS NULL OR "commission_minimum_fee" IS NULL OR "commission_maximum_fee" >= "commission_minimum_fee"),
  ADD CONSTRAINT "client_trading_mandates_commission_override_check"
    CHECK (
      ("commission_source" = 'tenant_default' AND "commission_rate_pct" IS NULL AND "commission_minimum_fee" IS NULL AND "commission_maximum_fee" IS NULL AND "commission_effective_from" IS NULL AND "commission_reason" IS NULL)
      OR
      ("commission_source" = 'client_override' AND "commission_rate_pct" IS NOT NULL AND "commission_effective_from" IS NOT NULL AND length(trim("commission_reason")) > 0)
    );
