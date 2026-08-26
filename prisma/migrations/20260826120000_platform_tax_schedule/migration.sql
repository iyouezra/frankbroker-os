CREATE TABLE "platform_tax_schedules" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "legal_reference" TEXT NOT NULL,
  "source_evidence" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_tax_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_tax_schedules_version_key" ON "platform_tax_schedules"("version");
CREATE INDEX "platform_tax_schedules_status_effective_from_idx" ON "platform_tax_schedules"("status", "effective_from");

CREATE TABLE "platform_tax_rules" (
  "id" TEXT NOT NULL,
  "platform_tax_schedule_id" TEXT NOT NULL,
  "applies_to" TEXT NOT NULL,
  "asset_class" TEXT NOT NULL,
  "rate_pct" DECIMAL(8,4) NOT NULL,
  "calculation_basis" TEXT NOT NULL,
  "collection_method" TEXT NOT NULL,
  "inflation_adjustment_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
  CONSTRAINT "platform_tax_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_tax_rules_rate_check" CHECK ("rate_pct" >= 0 AND "rate_pct" <= 100),
  CONSTRAINT "platform_tax_rules_inflation_check" CHECK ("inflation_adjustment_pct" >= 0 AND "inflation_adjustment_pct" <= 100),
  CONSTRAINT "platform_tax_rules_scope_check" CHECK (
    ("applies_to" = 'dividend' AND "asset_class" = 'equity' AND "calculation_basis" = 'gross' AND "collection_method" = 'issuer_withheld') OR
    ("applies_to" = 'interest' AND "asset_class" = 'bond' AND "calculation_basis" = 'gross' AND "collection_method" = 'issuer_withheld') OR
    ("applies_to" = 'capital_gain' AND "asset_class" IN ('equity', 'bond') AND "calculation_basis" = 'adjusted_gain' AND "collection_method" = 'investor_payable')
  )
);

CREATE UNIQUE INDEX "platform_tax_rules_platform_tax_schedule_id_applies_to_asset_class_key" ON "platform_tax_rules"("platform_tax_schedule_id", "applies_to", "asset_class");
CREATE INDEX "platform_tax_rules_applies_to_asset_class_idx" ON "platform_tax_rules"("applies_to", "asset_class");
ALTER TABLE "platform_tax_rules" ADD CONSTRAINT "platform_tax_rules_platform_tax_schedule_id_fkey" FOREIGN KEY ("platform_tax_schedule_id") REFERENCES "platform_tax_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "corporate_action_entitlements"
  ADD COLUMN "withholding_agent" TEXT,
  ADD COLUMN "tax_liability_party" TEXT,
  ADD COLUMN "withholding_evidence" TEXT;

ALTER TABLE "tax_calculations" ALTER COLUMN "tax_policy_version_id" DROP NOT NULL;
ALTER TABLE "tax_calculations" ADD COLUMN "platform_tax_rule_id" TEXT;
ALTER TABLE "tax_calculations" ADD CONSTRAINT "tax_calculations_one_rule_source_check" CHECK (("tax_policy_version_id" IS NOT NULL)::int + ("platform_tax_rule_id" IS NOT NULL)::int = 1);
CREATE UNIQUE INDEX "tax_calculations_realized_gain_allocation_id_platform_tax_rule_id_revision_key" ON "tax_calculations"("realized_gain_allocation_id", "platform_tax_rule_id", "revision");
CREATE UNIQUE INDEX "tax_calculations_corporate_action_entitlement_id_platform_tax_rule_id_revision_key" ON "tax_calculations"("corporate_action_entitlement_id", "platform_tax_rule_id", "revision");
CREATE INDEX "tax_calculations_platform_tax_rule_id_calculated_at_idx" ON "tax_calculations"("platform_tax_rule_id", "calculated_at");
ALTER TABLE "tax_calculations" ADD CONSTRAINT "tax_calculations_platform_tax_rule_id_fkey" FOREIGN KEY ("platform_tax_rule_id") REFERENCES "platform_tax_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Current federal rules are installed as a platform baseline, not copied into
-- each brokerage. Platform Admin can supersede them with a new effective version.
INSERT INTO "platform_tax_schedules" ("id", "name", "version", "status", "effective_from", "legal_reference", "source_evidence")
VALUES (
  'platform_tax_et_2025_1',
  'Ethiopian investment income and taxable-asset gains',
  'ET-2025.1',
  'published',
  DATE '2025-07-08',
  'Federal Income Tax Proclamation No. 979/2016 as amended by Proclamation No. 1395/2025, Articles 57, 58 and 61',
  '{"evidenceReference":"Federal Negarit Gazette No. 64, 1 September 2025","reviewRequired":true}'::jsonb
);

INSERT INTO "platform_tax_rules" ("id", "platform_tax_schedule_id", "applies_to", "asset_class", "rate_pct", "calculation_basis", "collection_method", "inflation_adjustment_pct") VALUES
  ('platform_tax_et_2025_1_dividend_equity', 'platform_tax_et_2025_1', 'dividend', 'equity', 15, 'gross', 'issuer_withheld', 0),
  ('platform_tax_et_2025_1_interest_bond', 'platform_tax_et_2025_1', 'interest', 'bond', 10, 'gross', 'issuer_withheld', 0),
  ('platform_tax_et_2025_1_gain_equity', 'platform_tax_et_2025_1', 'capital_gain', 'equity', 15, 'adjusted_gain', 'investor_payable', 30),
  ('platform_tax_et_2025_1_gain_bond', 'platform_tax_et_2025_1', 'capital_gain', 'bond', 15, 'adjusted_gain', 'investor_payable', 30);
