-- Tenant-owned configuration shared by the platform admin, broker OMS, and investor portal.
ALTER TABLE "users" ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "clients"
  ADD COLUMN "identity_reference" TEXT,
  ADD COLUMN "fayda_last4" TEXT,
  ADD COLUMN "tax_id_last4" TEXT,
  ADD COLUMN "kyc_consent_at" TIMESTAMP(3);

CREATE TABLE "broker_settings" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "trading_name" TEXT NOT NULL,
  "plan" TEXT NOT NULL DEFAULT 'Pilot',
  "domain" TEXT,
  "support_email" TEXT,
  "primary_color" TEXT NOT NULL DEFAULT '#0C8189',
  "welcome_message" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
  "business_date" DATE NOT NULL,
  "features" JSONB NOT NULL,
  "maker_checker" BOOLEAN NOT NULL DEFAULT true,
  "approval_threshold" DECIMAL(20,4) NOT NULL DEFAULT 250000,
  "client_daily_limit" DECIMAL(20,4) NOT NULL DEFAULT 2500000,
  "brokerage_fee_pct" DECIMAL(8,4) NOT NULL DEFAULT 0.5,
  "minimum_fee" DECIMAL(20,4) NOT NULL DEFAULT 25,
  "settlement_cycle" TEXT NOT NULL DEFAULT 'T+2',
  "allowed_order_types" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "broker_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "broker_instruments" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "instrument_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "broker_instruments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_integrations" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'not_connected',
  "mode" TEXT NOT NULL DEFAULT 'manual',
  "settings" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "broker_settings_broker_id_key" ON "broker_settings"("broker_id");
CREATE UNIQUE INDEX "broker_instruments_broker_id_instrument_id_key" ON "broker_instruments"("broker_id", "instrument_id");
CREATE INDEX "broker_instruments_instrument_id_idx" ON "broker_instruments"("instrument_id");
CREATE UNIQUE INDEX "tenant_integrations_broker_id_key_key" ON "tenant_integrations"("broker_id", "key");
CREATE INDEX "tenant_integrations_broker_id_idx" ON "tenant_integrations"("broker_id");

ALTER TABLE "broker_settings" ADD CONSTRAINT "broker_settings_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broker_instruments" ADD CONSTRAINT "broker_instruments_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broker_instruments" ADD CONSTRAINT "broker_instruments_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
