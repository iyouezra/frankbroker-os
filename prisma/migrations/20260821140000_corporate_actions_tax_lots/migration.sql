CREATE TABLE "corporate_actions" (
  "id" TEXT NOT NULL, "broker_id" TEXT NOT NULL, "instrument_id" TEXT NOT NULL,
  "action_type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft',
  "announcement_date" DATE, "ex_date" DATE, "record_date" DATE NOT NULL,
  "election_deadline" DATE, "payment_date" DATE NOT NULL, "currency" TEXT NOT NULL DEFAULT 'ETB',
  "cash_rate_per_unit" DECIMAL(20,8), "security_ratio_numerator" DECIMAL(24,8),
  "security_ratio_denominator" DECIMAL(24,8), "default_election" TEXT NOT NULL DEFAULT 'cash',
  "supports_reinvestment" BOOLEAN NOT NULL DEFAULT false, "tax_treatment" TEXT NOT NULL DEFAULT 'policy',
  "source_reference" TEXT NOT NULL, "source_evidence" JSONB, "terms_snapshot" JSONB,
  "created_by" TEXT NOT NULL, "approved_by" TEXT, "approved_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corporate_actions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "corporate_actions_broker_id_source_reference_key" ON "corporate_actions"("broker_id", "source_reference");
CREATE INDEX "corporate_actions_broker_id_status_payment_date_idx" ON "corporate_actions"("broker_id", "status", "payment_date");
CREATE INDEX "corporate_actions_instrument_id_record_date_idx" ON "corporate_actions"("instrument_id", "record_date");
ALTER TABLE "corporate_actions" ADD CONSTRAINT "corporate_actions_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "corporate_actions" ADD CONSTRAINT "corporate_actions_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "corporate_action_entitlements" (
  "id" TEXT NOT NULL, "corporate_action_id" TEXT NOT NULL, "account_id" TEXT NOT NULL,
  "ledger_quantity" DECIMAL(24,8) NOT NULL, "external_quantity" DECIMAL(24,8),
  "eligible_quantity" DECIMAL(24,8) NOT NULL, "position_source" TEXT NOT NULL,
  "reconciliation_status" TEXT NOT NULL DEFAULT 'unverified', "gross_cash" DECIMAL(20,4),
  "withholding_amount" DECIMAL(20,4), "net_cash" DECIMAL(20,4),
  "withholding_status" TEXT NOT NULL DEFAULT 'unconfigured', "security_quantity" DECIMAL(24,8),
  "election" TEXT NOT NULL DEFAULT 'cash', "election_recorded_at" TIMESTAMP(3), "election_evidence" TEXT,
  "status" TEXT NOT NULL DEFAULT 'calculated', "payment_reference" TEXT, "paid_at" TIMESTAMP(3),
  "exception_reason" TEXT, "calculation_snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "corporate_action_entitlements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "corporate_action_entitlements_corporate_action_id_account_id_key" ON "corporate_action_entitlements"("corporate_action_id", "account_id");
CREATE INDEX "corporate_action_entitlements_account_id_status_idx" ON "corporate_action_entitlements"("account_id", "status");
ALTER TABLE "corporate_action_entitlements" ADD CONSTRAINT "corporate_action_entitlements_corporate_action_id_fkey" FOREIGN KEY ("corporate_action_id") REFERENCES "corporate_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "corporate_action_entitlements" ADD CONSTRAINT "corporate_action_entitlements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "tax_policy_versions" (
  "id" TEXT NOT NULL, "broker_id" TEXT NOT NULL, "name" TEXT NOT NULL, "version" TEXT NOT NULL,
  "applies_to" TEXT NOT NULL, "asset_class" TEXT, "rate_pct" DECIMAL(8,4) NOT NULL,
  "calculation_basis" TEXT NOT NULL DEFAULT 'gain', "withholding_required" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'draft', "effective_from" DATE NOT NULL, "effective_to" DATE,
  "retrospective_from" DATE, "legal_reference" TEXT NOT NULL, "source_evidence" JSONB,
  "approved_by" TEXT, "approved_at" TIMESTAMP(3), "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_policy_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tax_policy_versions_broker_id_applies_to_asset_class_version_key" ON "tax_policy_versions"("broker_id", "applies_to", "asset_class", "version");
CREATE INDEX "tax_policy_versions_broker_id_status_applies_to_effective_from_idx" ON "tax_policy_versions"("broker_id", "status", "applies_to", "effective_from");
ALTER TABLE "tax_policy_versions" ADD CONSTRAINT "tax_policy_versions_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tax_lots" (
  "id" TEXT NOT NULL, "account_id" TEXT NOT NULL, "instrument_id" TEXT NOT NULL,
  "acquisition_trade_id" TEXT, "acquisition_date" DATE, "original_quantity" DECIMAL(24,8) NOT NULL,
  "remaining_quantity" DECIMAL(24,8) NOT NULL, "acquisition_gross" DECIMAL(20,4),
  "acquisition_fees" DECIMAL(20,4), "cost_basis" DECIMAL(20,4), "unit_cost" DECIMAL(20,8),
  "basis_status" TEXT NOT NULL DEFAULT 'unknown', "basis_source" TEXT NOT NULL,
  "source_reference" TEXT, "evidence_reference" TEXT, "verified_by" TEXT, "verified_at" TIMESTAMP(3),
  "notes" TEXT, "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_lots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tax_lots_acquisition_trade_id_key" ON "tax_lots"("acquisition_trade_id");
CREATE INDEX "tax_lots_account_id_instrument_id_acquisition_date_idx" ON "tax_lots"("account_id", "instrument_id", "acquisition_date");
CREATE INDEX "tax_lots_basis_status_remaining_quantity_idx" ON "tax_lots"("basis_status", "remaining_quantity");
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_lots" ADD CONSTRAINT "tax_lots_acquisition_trade_id_fkey" FOREIGN KEY ("acquisition_trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "realized_gain_allocations" (
  "id" TEXT NOT NULL, "sale_trade_id" TEXT, "corporate_action_entitlement_id" TEXT, "tax_lot_id" TEXT NOT NULL,
  "quantity" DECIMAL(24,8) NOT NULL, "gross_proceeds" DECIMAL(20,4) NOT NULL,
  "allocated_fees" DECIMAL(20,4) NOT NULL, "net_proceeds" DECIMAL(20,4) NOT NULL,
  "cost_basis" DECIMAL(20,4), "realized_gain" DECIMAL(20,4), "basis_status" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'provisional', "calculation_snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "realized_gain_allocations_one_source_check" CHECK (("sale_trade_id" IS NOT NULL)::int + ("corporate_action_entitlement_id" IS NOT NULL)::int = 1),
  CONSTRAINT "realized_gain_allocations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "realized_gain_allocations_sale_trade_id_tax_lot_id_key" ON "realized_gain_allocations"("sale_trade_id", "tax_lot_id");
CREATE UNIQUE INDEX "realized_gain_allocations_corporate_action_entitlement_id_tax_lot_id_key" ON "realized_gain_allocations"("corporate_action_entitlement_id", "tax_lot_id");
CREATE INDEX "realized_gain_allocations_sale_trade_id_idx" ON "realized_gain_allocations"("sale_trade_id");
CREATE INDEX "realized_gain_allocations_basis_status_created_at_idx" ON "realized_gain_allocations"("basis_status", "created_at");
ALTER TABLE "realized_gain_allocations" ADD CONSTRAINT "realized_gain_allocations_sale_trade_id_fkey" FOREIGN KEY ("sale_trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "realized_gain_allocations" ADD CONSTRAINT "realized_gain_allocations_corporate_action_entitlement_id_fkey" FOREIGN KEY ("corporate_action_entitlement_id") REFERENCES "corporate_action_entitlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "realized_gain_allocations" ADD CONSTRAINT "realized_gain_allocations_tax_lot_id_fkey" FOREIGN KEY ("tax_lot_id") REFERENCES "tax_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "tax_calculations" (
  "id" TEXT NOT NULL, "realized_gain_allocation_id" TEXT, "corporate_action_entitlement_id" TEXT,
  "tax_policy_version_id" TEXT NOT NULL, "revision" INTEGER NOT NULL DEFAULT 1,
  "taxable_amount" DECIMAL(20,4) NOT NULL, "rate_pct" DECIMAL(8,4) NOT NULL,
  "tax_amount" DECIMAL(20,4) NOT NULL, "status" TEXT NOT NULL DEFAULT 'estimate',
  "supersedes_id" TEXT, "calculation_snapshot" JSONB, "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_calculations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_calculations_one_source_check" CHECK (("realized_gain_allocation_id" IS NOT NULL)::int + ("corporate_action_entitlement_id" IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX "tax_calculations_realized_gain_allocation_id_tax_policy_version_id_revision_key" ON "tax_calculations"("realized_gain_allocation_id", "tax_policy_version_id", "revision");
CREATE UNIQUE INDEX "tax_calculations_corporate_action_entitlement_id_tax_policy_version_id_revision_key" ON "tax_calculations"("corporate_action_entitlement_id", "tax_policy_version_id", "revision");
CREATE INDEX "tax_calculations_tax_policy_version_id_calculated_at_idx" ON "tax_calculations"("tax_policy_version_id", "calculated_at");
ALTER TABLE "tax_calculations" ADD CONSTRAINT "tax_calculations_realized_gain_allocation_id_fkey" FOREIGN KEY ("realized_gain_allocation_id") REFERENCES "realized_gain_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_calculations" ADD CONSTRAINT "tax_calculations_corporate_action_entitlement_id_fkey" FOREIGN KEY ("corporate_action_entitlement_id") REFERENCES "corporate_action_entitlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tax_calculations" ADD CONSTRAINT "tax_calculations_tax_policy_version_id_fkey" FOREIGN KEY ("tax_policy_version_id") REFERENCES "tax_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing/dematerialized positions retain quantity but deliberately receive no
-- invented acquisition date or cost. Evidence can be supplied and reviewed later.
INSERT INTO "tax_lots" ("id", "account_id", "instrument_id", "original_quantity", "remaining_quantity", "basis_status", "basis_source", "source_reference", "notes", "created_at", "updated_at")
SELECT 'lot_import_' || h."id", h."account_id", h."instrument_id", h."total_quantity", h."total_quantity", 'unknown', 'dematerialized_opening', h."id", 'Opening position imported without documentary cost basis', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "holdings" h WHERE h."total_quantity" > 0
ON CONFLICT DO NOTHING;
