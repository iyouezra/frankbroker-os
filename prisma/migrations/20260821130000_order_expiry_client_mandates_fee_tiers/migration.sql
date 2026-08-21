CREATE TABLE "fee_tiers" (
  "id" TEXT NOT NULL,
  "fee_rule_id" TEXT NOT NULL,
  "minimum_order_value" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "maximum_order_value" DECIMAL(20,4),
  "brokerage_pct" DECIMAL(8,4) NOT NULL,
  CONSTRAINT "fee_tiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_tiers_fee_rule_id_minimum_order_value_key" ON "fee_tiers"("fee_rule_id", "minimum_order_value");
CREATE INDEX "fee_tiers_fee_rule_id_maximum_order_value_idx" ON "fee_tiers"("fee_rule_id", "maximum_order_value");
ALTER TABLE "fee_tiers" ADD CONSTRAINT "fee_tiers_fee_rule_id_fkey" FOREIGN KEY ("fee_rule_id") REFERENCES "fee_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "client_trading_mandates" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "buy_enabled" BOOLEAN NOT NULL DEFAULT true,
  "sell_enabled" BOOLEAN NOT NULL DEFAULT true,
  "max_order_value" DECIMAL(20,4),
  "daily_gross_limit" DECIMAL(20,4),
  "allowed_asset_classes" JSONB,
  "allowed_market_segments" JSONB,
  "allowed_order_types" JSONB,
  "commission_source" TEXT NOT NULL DEFAULT 'tenant_default',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_trading_mandates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_trading_mandates_client_id_key" ON "client_trading_mandates"("client_id");
CREATE INDEX "client_trading_mandates_broker_id_status_idx" ON "client_trading_mandates"("broker_id", "status");
ALTER TABLE "client_trading_mandates" ADD CONSTRAINT "client_trading_mandates_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_trading_mandates" ADD CONSTRAINT "client_trading_mandates_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "client_trading_mandates" ("id", "broker_id", "client_id", "commission_source", "created_at", "updated_at")
SELECT 'mandate_' || "id", "broker_id", "id", 'tenant_default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "clients"
ON CONFLICT ("client_id") DO NOTHING;
