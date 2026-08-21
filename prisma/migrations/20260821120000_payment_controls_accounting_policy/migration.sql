CREATE TABLE "payment_provider_events" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "cash_movement_id" TEXT,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "merchant_reference" TEXT,
    "event_type" TEXT NOT NULL,
    "provider_status" TEXT NOT NULL,
    "gross_amount" DECIMAL(20,4),
    "provider_fee" DECIMAL(20,4),
    "net_amount" DECIMAL(20,4),
    "currency" TEXT,
    "settlement_batch_id" TEXT,
    "destination_account_ref" TEXT,
    "finality_at" TIMESTAMP(3),
    "original_transaction_id" TEXT,
    "payload_hash" TEXT NOT NULL,
    "payload" JSONB,
    "processing_status" TEXT NOT NULL DEFAULT 'received',
    "failure_reason" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounting_policy_versions" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "client_money_presentation" TEXT NOT NULL,
    "gateway_recognition_point" TEXT NOT NULL,
    "deposit_availability_point" TEXT NOT NULL,
    "gateway_fee_treatment" TEXT NOT NULL,
    "protected_resource_definition" TEXT NOT NULL,
    "fee_sweep_timing" TEXT NOT NULL,
    "withdrawal_derecognition_point" TEXT NOT NULL,
    "rationale" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accounting_policy_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_provider_events_broker_id_provider_provider_event_id_key"
ON "payment_provider_events"("broker_id", "provider", "provider_event_id");
CREATE INDEX "payment_provider_events_broker_id_transaction_id_idx"
ON "payment_provider_events"("broker_id", "transaction_id");
CREATE INDEX "payment_provider_events_broker_id_settlement_batch_id_idx"
ON "payment_provider_events"("broker_id", "settlement_batch_id");
CREATE INDEX "payment_provider_events_broker_id_processing_status_received_at_idx"
ON "payment_provider_events"("broker_id", "processing_status", "received_at");

CREATE UNIQUE INDEX "accounting_policy_versions_broker_id_version_key"
ON "accounting_policy_versions"("broker_id", "version");
CREATE INDEX "accounting_policy_versions_broker_id_status_effective_from_idx"
ON "accounting_policy_versions"("broker_id", "status", "effective_from");

ALTER TABLE "payment_provider_events"
ADD CONSTRAINT "payment_provider_events_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_provider_events"
ADD CONSTRAINT "payment_provider_events_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accounting_policy_versions"
ADD CONSTRAINT "accounting_policy_versions_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounting_policy_versions"
ADD CONSTRAINT "accounting_policy_versions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_status_check"
CHECK ("processing_status" IN ('received', 'processed', 'ignored', 'failed'));
ALTER TABLE "accounting_policy_versions" ADD CONSTRAINT "accounting_policy_versions_status_check"
CHECK ("status" IN ('draft', 'approved', 'retired'));
