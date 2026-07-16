ALTER TABLE "clients"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "proof_of_address_type" TEXT,
  ADD COLUMN "proof_of_address_reference" TEXT,
  ADD COLUMN "proof_of_address_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "business_registration_number" TEXT,
  ADD COLUMN "authorized_representative_name" TEXT,
  ADD COLUMN "signatory_authority_confirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "beneficial_owners" JSONB,
  ADD COLUMN "kyc_review_due_at" TIMESTAMP(3),
  ADD COLUMN "electronic_delivery_consent_at" TIMESTAMP(3);

ALTER TABLE "accounts"
  ADD COLUMN "restriction_reason" TEXT,
  ADD COLUMN "restricted_at" TIMESTAMP(3),
  ADD COLUMN "closure_requested_at" TIMESTAMP(3),
  ADD COLUMN "closed_at" TIMESTAMP(3);

ALTER TABLE "instruments"
  ADD COLUMN "market_segment" TEXT NOT NULL DEFAULT 'main';

ALTER TABLE "broker_settings"
  ADD COLUMN "require_terms_acceptance" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "discrepancy_window_days" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "kyc_review_months" INTEGER NOT NULL DEFAULT 12;

ALTER TABLE "orders"
  ADD COLUMN "estimated_fee_breakdown" JSONB,
  ADD COLUMN "terms_version" TEXT,
  ADD COLUMN "disclosure_version" TEXT,
  ADD COLUMN "disclosure_accepted_at" TIMESTAMP(3);

ALTER TABLE "trades"
  ADD COLUMN "fee_breakdown" JSONB;

CREATE TABLE "legal_documents" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL DEFAULT 'brokerage_terms',
  "title" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en',
  "summary" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "effective_at" DATE NOT NULL,
  "published_at" TIMESTAMP(3),
  "requires_reacceptance" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_consents" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "legal_document_id" TEXT,
  "consent_type" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "accepted" BOOLEAN NOT NULL DEFAULT true,
  "channel" TEXT NOT NULL DEFAULT 'investor_portal',
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawn_at" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "client_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fee_schedules" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fee_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fee_rules" (
  "id" TEXT NOT NULL,
  "fee_schedule_id" TEXT NOT NULL,
  "asset_class" TEXT NOT NULL,
  "market_segment" TEXT NOT NULL DEFAULT 'main',
  "brokerage_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "regulator_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "exchange_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "csd_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "minimum_fee" DECIMAL(20,4) NOT NULL DEFAULT 0,
  "maximum_fee" DECIMAL(20,4),
  CONSTRAINT "fee_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_service_requests" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "account_id" TEXT,
  "order_id" TEXT,
  "request_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "submitted_by" TEXT NOT NULL,
  "assigned_to" TEXT,
  "resolution_notes" TEXT,
  "resolved_by" TEXT,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "client_service_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_documents_broker_id_document_type_version_language_key"
  ON "legal_documents"("broker_id", "document_type", "version", "language");
CREATE INDEX "legal_documents_broker_id_document_type_status_idx"
  ON "legal_documents"("broker_id", "document_type", "status");
CREATE INDEX "client_consents_client_id_consent_type_accepted_at_idx"
  ON "client_consents"("client_id", "consent_type", "accepted_at");
CREATE UNIQUE INDEX "fee_schedules_broker_id_version_key"
  ON "fee_schedules"("broker_id", "version");
CREATE INDEX "fee_schedules_broker_id_status_effective_from_idx"
  ON "fee_schedules"("broker_id", "status", "effective_from");
CREATE UNIQUE INDEX "fee_rules_fee_schedule_id_asset_class_market_segment_key"
  ON "fee_rules"("fee_schedule_id", "asset_class", "market_segment");
CREATE INDEX "client_service_requests_broker_id_status_submitted_at_idx"
  ON "client_service_requests"("broker_id", "status", "submitted_at");
CREATE INDEX "client_service_requests_client_id_status_idx"
  ON "client_service_requests"("client_id", "status");

ALTER TABLE "legal_documents"
  ADD CONSTRAINT "legal_documents_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_consents"
  ADD CONSTRAINT "client_consents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_consents"
  ADD CONSTRAINT "client_consents_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "legal_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fee_schedules"
  ADD CONSTRAINT "fee_schedules_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_rules"
  ADD CONSTRAINT "fee_rules_fee_schedule_id_fkey" FOREIGN KEY ("fee_schedule_id") REFERENCES "fee_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_service_requests"
  ADD CONSTRAINT "client_service_requests_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_service_requests"
  ADD CONSTRAINT "client_service_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_service_requests"
  ADD CONSTRAINT "client_service_requests_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_service_requests"
  ADD CONSTRAINT "client_service_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
