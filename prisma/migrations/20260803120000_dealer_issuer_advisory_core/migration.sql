-- Additive tenant capability and issuer-advisory core. Legacy broker tables and
-- columns remain unchanged so existing OMS installations retain compatibility.
CREATE TABLE "tenant_profiles" (
    "tenant_id" TEXT NOT NULL,
    "business_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_profiles_pkey" PRIMARY KEY ("tenant_id")
);

CREATE TABLE "tenant_licenses" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "regulator" TEXT NOT NULL DEFAULT 'ECMA',
    "license_type" TEXT NOT NULL, "license_number" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'active',
    "valid_from" DATE, "valid_to" DATE, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "tenant_licenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_entitlements" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "activity_key" TEXT NOT NULL, "basis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active', "valid_from" DATE, "valid_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_modules" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "module_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "checklist_templates" (
    "id" TEXT NOT NULL, "code" TEXT NOT NULL, "version" TEXT NOT NULL, "transaction_type" TEXT NOT NULL,
    "market_segment" TEXT NOT NULL, "title" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft',
    "effective_from" DATE NOT NULL, "source_set" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "checklist_template_items" (
    "id" TEXT NOT NULL, "template_id" TEXT NOT NULL, "item_code" TEXT NOT NULL, "section" TEXT NOT NULL,
    "title" TEXT NOT NULL, "guidance" TEXT NOT NULL, "expected_evidence" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true, "sort_order" INTEGER NOT NULL, "source_title" TEXT NOT NULL,
    "source_url" TEXT NOT NULL, "source_reference" TEXT NOT NULL,
    CONSTRAINT "checklist_template_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_checklist_packs" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "template_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_checklist_packs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "issuers" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "legal_name" TEXT NOT NULL, "trading_name" TEXT,
    "entity_type" TEXT NOT NULL, "registration_number" TEXT, "tin_reference" TEXT, "sector" TEXT,
    "contact_name" TEXT, "contact_email" TEXT, "contact_phone" TEXT, "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "issuers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "advisory_deals" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "issuer_id" TEXT NOT NULL,
    "checklist_template_id" TEXT NOT NULL, "name" TEXT NOT NULL, "transaction_type" TEXT NOT NULL,
    "market_segment" TEXT NOT NULL, "mandate_reference" TEXT, "lead_user_id" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'draft', "status" TEXT NOT NULL DEFAULT 'active', "target_date" DATE,
    "stage_override_reason" TEXT, "created_by_user_id" TEXT, "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "advisory_deals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deal_parties" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "deal_id" TEXT NOT NULL, "party_role" TEXT NOT NULL,
    "organization" TEXT NOT NULL, "contact_name" TEXT, "email" TEXT, "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deal_parties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deal_checklist_items" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "deal_id" TEXT NOT NULL, "template_item_id" TEXT,
    "item_code" TEXT NOT NULL, "section" TEXT NOT NULL, "title" TEXT NOT NULL, "guidance" TEXT NOT NULL,
    "expected_evidence" TEXT NOT NULL, "required" BOOLEAN NOT NULL DEFAULT true,
    "custom" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL, "source_title" TEXT,
    "source_url" TEXT, "source_reference" TEXT, "owner_user_id" TEXT, "due_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'not_started', "notes" TEXT, "prepared_by_user_id" TEXT,
    "prepared_at" TIMESTAMP(3), "reviewed_by_user_id" TEXT, "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT, "not_applicable_reason" TEXT, "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deal_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deal_documents" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "deal_id" TEXT NOT NULL, "checklist_item_id" TEXT,
    "title" TEXT NOT NULL, "document_type" TEXT NOT NULL, "owner_user_id" TEXT, "expected_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'expected', "external_url" TEXT, "current_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deal_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deal_document_versions" (
    "id" TEXT NOT NULL, "document_id" TEXT NOT NULL, "version_no" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL, "mime_type" TEXT NOT NULL, "size_bytes" INTEGER NOT NULL,
    "uploaded_by" TEXT, "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deal_document_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deal_document_contents" (
    "version_id" TEXT NOT NULL, "bytes" BYTEA NOT NULL,
    CONSTRAINT "deal_document_contents_pkey" PRIMARY KEY ("version_id")
);

CREATE TABLE "deal_tasks" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "deal_id" TEXT NOT NULL, "checklist_item_id" TEXT,
    "document_id" TEXT, "title" TEXT NOT NULL, "description" TEXT, "assigned_to_user_id" TEXT,
    "created_by_user_id" TEXT, "due_date" DATE, "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open', "completed_at" TIMESTAMP(3), "completion_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "deal_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deal_submissions" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "deal_id" TEXT NOT NULL, "authority" TEXT NOT NULL,
    "submission_type" TEXT NOT NULL, "reference" TEXT, "status" TEXT NOT NULL DEFAULT 'preparing',
    "submitted_at" TIMESTAMP(3), "submitted_by" TEXT, "response_due_at" DATE, "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deal_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "regulatory_queries" (
    "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "submission_id" TEXT NOT NULL, "reference" TEXT,
    "question" TEXT NOT NULL, "owner_user_id" TEXT, "received_at" TIMESTAMP(3) NOT NULL, "due_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'open', "response_summary" TEXT, "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "regulatory_queries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tenant_licenses_tenant_id_status_idx" ON "tenant_licenses"("tenant_id", "status");
CREATE UNIQUE INDEX "tenant_licenses_tenant_id_license_number_key" ON "tenant_licenses"("tenant_id", "license_number");
CREATE INDEX "tenant_entitlements_tenant_id_status_idx" ON "tenant_entitlements"("tenant_id", "status");
CREATE UNIQUE INDEX "tenant_entitlements_tenant_id_activity_key_key" ON "tenant_entitlements"("tenant_id", "activity_key");
CREATE INDEX "tenant_modules_tenant_id_enabled_idx" ON "tenant_modules"("tenant_id", "enabled");
CREATE UNIQUE INDEX "tenant_modules_tenant_id_module_key_key" ON "tenant_modules"("tenant_id", "module_key");
CREATE INDEX "checklist_templates_transaction_type_market_segment_status_idx" ON "checklist_templates"("transaction_type", "market_segment", "status");
CREATE UNIQUE INDEX "checklist_templates_code_version_market_segment_key" ON "checklist_templates"("code", "version", "market_segment");
CREATE INDEX "checklist_template_items_template_id_sort_order_idx" ON "checklist_template_items"("template_id", "sort_order");
CREATE UNIQUE INDEX "checklist_template_items_template_id_item_code_key" ON "checklist_template_items"("template_id", "item_code");
CREATE INDEX "tenant_checklist_packs_tenant_id_enabled_idx" ON "tenant_checklist_packs"("tenant_id", "enabled");
CREATE UNIQUE INDEX "tenant_checklist_packs_tenant_id_template_id_key" ON "tenant_checklist_packs"("tenant_id", "template_id");
CREATE INDEX "issuers_tenant_id_status_legal_name_idx" ON "issuers"("tenant_id", "status", "legal_name");
CREATE UNIQUE INDEX "issuers_tenant_id_registration_number_key" ON "issuers"("tenant_id", "registration_number");
CREATE INDEX "advisory_deals_tenant_id_stage_status_idx" ON "advisory_deals"("tenant_id", "stage", "status");
CREATE INDEX "advisory_deals_tenant_id_issuer_id_idx" ON "advisory_deals"("tenant_id", "issuer_id");
CREATE UNIQUE INDEX "advisory_deals_tenant_id_mandate_reference_key" ON "advisory_deals"("tenant_id", "mandate_reference");
CREATE INDEX "deal_parties_tenant_id_deal_id_party_role_idx" ON "deal_parties"("tenant_id", "deal_id", "party_role");
CREATE INDEX "deal_checklist_items_tenant_id_deal_id_status_idx" ON "deal_checklist_items"("tenant_id", "deal_id", "status");
CREATE INDEX "deal_checklist_items_owner_user_id_status_due_date_idx" ON "deal_checklist_items"("owner_user_id", "status", "due_date");
CREATE UNIQUE INDEX "deal_checklist_items_deal_id_item_code_key" ON "deal_checklist_items"("deal_id", "item_code");
CREATE UNIQUE INDEX "deal_documents_current_version_id_key" ON "deal_documents"("current_version_id");
CREATE INDEX "deal_documents_tenant_id_deal_id_status_idx" ON "deal_documents"("tenant_id", "deal_id", "status");
CREATE INDEX "deal_document_versions_document_id_uploaded_at_idx" ON "deal_document_versions"("document_id", "uploaded_at");
CREATE UNIQUE INDEX "deal_document_versions_document_id_version_no_key" ON "deal_document_versions"("document_id", "version_no");
CREATE INDEX "deal_tasks_tenant_id_status_due_date_idx" ON "deal_tasks"("tenant_id", "status", "due_date");
CREATE INDEX "deal_tasks_tenant_id_assigned_to_user_id_status_idx" ON "deal_tasks"("tenant_id", "assigned_to_user_id", "status");
CREATE INDEX "deal_submissions_tenant_id_deal_id_status_idx" ON "deal_submissions"("tenant_id", "deal_id", "status");
CREATE INDEX "regulatory_queries_tenant_id_status_due_date_idx" ON "regulatory_queries"("tenant_id", "status", "due_date");

ALTER TABLE "tenant_profiles" ADD CONSTRAINT "tenant_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_licenses" ADD CONSTRAINT "tenant_licenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_checklist_packs" ADD CONSTRAINT "tenant_checklist_packs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_checklist_packs" ADD CONSTRAINT "tenant_checklist_packs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issuers" ADD CONSTRAINT "issuers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advisory_deals" ADD CONSTRAINT "advisory_deals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advisory_deals" ADD CONSTRAINT "advisory_deals_issuer_id_fkey" FOREIGN KEY ("issuer_id") REFERENCES "issuers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advisory_deals" ADD CONSTRAINT "advisory_deals_checklist_template_id_fkey" FOREIGN KEY ("checklist_template_id") REFERENCES "checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_parties" ADD CONSTRAINT "deal_parties_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "advisory_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_checklist_items" ADD CONSTRAINT "deal_checklist_items_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "advisory_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_checklist_items" ADD CONSTRAINT "deal_checklist_items_template_item_id_fkey" FOREIGN KEY ("template_item_id") REFERENCES "checklist_template_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "advisory_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "deal_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deal_document_versions" ADD CONSTRAINT "deal_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "deal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "deal_document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deal_document_contents" ADD CONSTRAINT "deal_document_contents_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "deal_document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_tasks" ADD CONSTRAINT "deal_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_tasks" ADD CONSTRAINT "deal_tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "advisory_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_tasks" ADD CONSTRAINT "deal_tasks_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "deal_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deal_tasks" ADD CONSTRAINT "deal_tasks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "deal_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "deal_submissions" ADD CONSTRAINT "deal_submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deal_submissions" ADD CONSTRAINT "deal_submissions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "advisory_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "regulatory_queries" ADD CONSTRAINT "regulatory_queries_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "deal_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
