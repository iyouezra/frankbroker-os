-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN     "source_linked_bank_account_id" TEXT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "tax_identity_reference" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "personal_trade_clearance_id" TEXT;

-- CreateTable
CREATE TABLE "beneficial_owners" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "ownership_percent" DECIMAL(8,4),
    "identity_reference" TEXT,
    "tax_reference" TEXT,
    "identifier_last7" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beneficial_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_rule_versions" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "rule_code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configuration" JSONB NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "changed_by_user_id" TEXT NOT NULL,
    "change_reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitoring_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_cases" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assigned_to_user_id" TEXT,
    "due_at" TIMESTAMP(3),
    "opened_by_user_id" TEXT NOT NULL,
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoring_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_alerts" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rule_code" TEXT NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "investigation_status" TEXT NOT NULL DEFAULT 'unreviewed',
    "clearance_status" TEXT NOT NULL DEFAULT 'not_required',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "client_id" TEXT,
    "cash_movement_id" TEXT,
    "order_id" TEXT,
    "case_id" TEXT,
    "assigned_to_user_id" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "cleared_by_user_id" TEXT,
    "cleared_at" TIMESTAMP(3),
    "clearance_decision" TEXT,
    "clearance_rationale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoring_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_case_events" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "note" TEXT,
    "restricted_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitoring_case_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_evidence" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitoring_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_audit_events" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "restricted_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitoring_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_conduct_profiles" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "identity_reference" TEXT NOT NULL,
    "fayda_last7" TEXT NOT NULL,
    "linked_client_id" TEXT,
    "linked_account_id" TEXT,
    "sensitive_market_access" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "designated_by_user_id" TEXT NOT NULL,
    "designated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annual_attestation_due_at" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_conduct_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_trade_clearances" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "employee_profile_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "max_quantity" DECIMAL(24,8),
    "max_value" DECIMAL(20,4),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_by_user_id" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "decision_reason" TEXT,
    "decided_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_trade_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restricted_securities" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restricted_securities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensitive_information_access" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "employee_profile_id" TEXT NOT NULL,
    "instrument_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "released_at" TIMESTAMP(3),
    "recorded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensitive_information_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_disclosures" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "employee_profile_id" TEXT NOT NULL,
    "disclosure_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "submitted_by_user_id" TEXT NOT NULL,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_disclosures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conduct_attestations" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "employee_profile_id" TEXT NOT NULL,
    "attestation_year" INTEGER NOT NULL,
    "statement_version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attested_at" TIMESTAMP(3),
    "exceptions" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conduct_attestations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_destination_exceptions" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "cash_movement_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_destination_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "beneficial_owners_broker_id_identity_reference_idx" ON "beneficial_owners"("broker_id", "identity_reference");

-- CreateIndex
CREATE INDEX "beneficial_owners_broker_id_tax_reference_idx" ON "beneficial_owners"("broker_id", "tax_reference");

-- CreateIndex
CREATE INDEX "monitoring_rule_versions_broker_id_category_effective_to_idx" ON "monitoring_rule_versions"("broker_id", "category", "effective_to");

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_rule_versions_broker_id_rule_code_version_key" ON "monitoring_rule_versions"("broker_id", "rule_code", "version");

-- CreateIndex
CREATE INDEX "monitoring_cases_broker_id_category_status_due_at_idx" ON "monitoring_cases"("broker_id", "category", "status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_cases_broker_id_reference_number_key" ON "monitoring_cases"("broker_id", "reference_number");

-- CreateIndex
CREATE INDEX "monitoring_alerts_broker_id_category_status_severity_detect_idx" ON "monitoring_alerts"("broker_id", "category", "status", "severity", "detected_at");

-- CreateIndex
CREATE INDEX "monitoring_alerts_cash_movement_id_status_idx" ON "monitoring_alerts"("cash_movement_id", "status");

-- CreateIndex
CREATE INDEX "monitoring_alerts_order_id_status_idx" ON "monitoring_alerts"("order_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_alerts_broker_id_fingerprint_key" ON "monitoring_alerts"("broker_id", "fingerprint");

-- CreateIndex
CREATE INDEX "monitoring_case_events_case_id_created_at_idx" ON "monitoring_case_events"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "monitoring_evidence_broker_id_case_id_uploaded_at_idx" ON "monitoring_evidence"("broker_id", "case_id", "uploaded_at");

-- CreateIndex
CREATE INDEX "monitoring_audit_events_broker_id_created_at_idx" ON "monitoring_audit_events"("broker_id", "created_at");

-- CreateIndex
CREATE INDEX "monitoring_audit_events_broker_id_entity_type_entity_id_idx" ON "monitoring_audit_events"("broker_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_conduct_profiles_user_id_key" ON "employee_conduct_profiles"("user_id");

-- CreateIndex
CREATE INDEX "employee_conduct_profiles_broker_id_status_idx" ON "employee_conduct_profiles"("broker_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employee_conduct_profiles_broker_id_identity_reference_key" ON "employee_conduct_profiles"("broker_id", "identity_reference");

-- CreateIndex
CREATE INDEX "personal_trade_clearances_broker_id_status_business_date_idx" ON "personal_trade_clearances"("broker_id", "status", "business_date");

-- CreateIndex
CREATE INDEX "personal_trade_clearances_employee_profile_id_instrument_id_idx" ON "personal_trade_clearances"("employee_profile_id", "instrument_id", "side", "business_date");

-- CreateIndex
CREATE INDEX "restricted_securities_broker_id_instrument_id_effective_to_idx" ON "restricted_securities"("broker_id", "instrument_id", "effective_to");

-- CreateIndex
CREATE INDEX "sensitive_information_access_broker_id_instrument_id_releas_idx" ON "sensitive_information_access"("broker_id", "instrument_id", "released_at");

-- CreateIndex
CREATE INDEX "sensitive_information_access_employee_profile_id_released_a_idx" ON "sensitive_information_access"("employee_profile_id", "released_at");

-- CreateIndex
CREATE INDEX "employee_disclosures_broker_id_disclosure_type_status_creat_idx" ON "employee_disclosures"("broker_id", "disclosure_type", "status", "created_at");

-- CreateIndex
CREATE INDEX "conduct_attestations_broker_id_status_attestation_year_idx" ON "conduct_attestations"("broker_id", "status", "attestation_year");

-- CreateIndex
CREATE UNIQUE INDEX "conduct_attestations_employee_profile_id_attestation_year_key" ON "conduct_attestations"("employee_profile_id", "attestation_year");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_destination_exceptions_cash_movement_id_key" ON "withdrawal_destination_exceptions"("cash_movement_id");

-- CreateIndex
CREATE INDEX "withdrawal_destination_exceptions_broker_id_status_created__idx" ON "withdrawal_destination_exceptions"("broker_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "cash_movements_source_linked_bank_account_id_idx" ON "cash_movements"("source_linked_bank_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_personal_trade_clearance_id_key" ON "orders"("personal_trade_clearance_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_personal_trade_clearance_id_fkey" FOREIGN KEY ("personal_trade_clearance_id") REFERENCES "personal_trade_clearances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_source_linked_bank_account_id_fkey" FOREIGN KEY ("source_linked_bank_account_id") REFERENCES "linked_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficial_owners" ADD CONSTRAINT "beneficial_owners_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficial_owners" ADD CONSTRAINT "beneficial_owners_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_rule_versions" ADD CONSTRAINT "monitoring_rule_versions_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_cases" ADD CONSTRAINT "monitoring_cases_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_alerts" ADD CONSTRAINT "monitoring_alerts_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_alerts" ADD CONSTRAINT "monitoring_alerts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_alerts" ADD CONSTRAINT "monitoring_alerts_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_alerts" ADD CONSTRAINT "monitoring_alerts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_alerts" ADD CONSTRAINT "monitoring_alerts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "monitoring_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_case_events" ADD CONSTRAINT "monitoring_case_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "monitoring_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_evidence" ADD CONSTRAINT "monitoring_evidence_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_evidence" ADD CONSTRAINT "monitoring_evidence_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "monitoring_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_audit_events" ADD CONSTRAINT "monitoring_audit_events_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_conduct_profiles" ADD CONSTRAINT "employee_conduct_profiles_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_conduct_profiles" ADD CONSTRAINT "employee_conduct_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_conduct_profiles" ADD CONSTRAINT "employee_conduct_profiles_linked_client_id_fkey" FOREIGN KEY ("linked_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_conduct_profiles" ADD CONSTRAINT "employee_conduct_profiles_linked_account_id_fkey" FOREIGN KEY ("linked_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_trade_clearances" ADD CONSTRAINT "personal_trade_clearances_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_trade_clearances" ADD CONSTRAINT "personal_trade_clearances_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_conduct_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_trade_clearances" ADD CONSTRAINT "personal_trade_clearances_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restricted_securities" ADD CONSTRAINT "restricted_securities_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restricted_securities" ADD CONSTRAINT "restricted_securities_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensitive_information_access" ADD CONSTRAINT "sensitive_information_access_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensitive_information_access" ADD CONSTRAINT "sensitive_information_access_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_conduct_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensitive_information_access" ADD CONSTRAINT "sensitive_information_access_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_disclosures" ADD CONSTRAINT "employee_disclosures_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_disclosures" ADD CONSTRAINT "employee_disclosures_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_conduct_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_attestations" ADD CONSTRAINT "conduct_attestations_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_attestations" ADD CONSTRAINT "conduct_attestations_employee_profile_id_fkey" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_conduct_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_destination_exceptions" ADD CONSTRAINT "withdrawal_destination_exceptions_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_destination_exceptions" ADD CONSTRAINT "withdrawal_destination_exceptions_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
