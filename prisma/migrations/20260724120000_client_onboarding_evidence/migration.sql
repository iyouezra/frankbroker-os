CREATE TABLE "client_documents" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "client_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_document_contents" (
    "document_id" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    CONSTRAINT "client_document_contents_pkey" PRIMARY KEY ("document_id")
);

CREATE TABLE "linked_bank_accounts" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "linked_bank_accounts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cash_movements" ADD COLUMN "linked_bank_account_id" TEXT;

CREATE UNIQUE INDEX "client_documents_client_id_document_type_key" ON "client_documents"("client_id", "document_type");
CREATE INDEX "client_documents_broker_id_status_uploaded_at_idx" ON "client_documents"("broker_id", "status", "uploaded_at");
CREATE UNIQUE INDEX "linked_bank_accounts_client_id_bank_name_account_number_key" ON "linked_bank_accounts"("client_id", "bank_name", "account_number");
CREATE INDEX "linked_bank_accounts_broker_id_status_created_at_idx" ON "linked_bank_accounts"("broker_id", "status", "created_at");
CREATE INDEX "cash_movements_linked_bank_account_id_idx" ON "cash_movements"("linked_bank_account_id");

ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_document_contents" ADD CONSTRAINT "client_document_contents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "client_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "linked_bank_accounts" ADD CONSTRAINT "linked_bank_accounts_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "linked_bank_accounts" ADD CONSTRAINT "linked_bank_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "linked_bank_accounts" ADD CONSTRAINT "linked_bank_accounts_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_linked_bank_account_id_fkey" FOREIGN KEY ("linked_bank_account_id") REFERENCES "linked_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "client_documents" (
  "id", "broker_id", "client_id", "document_type", "original_name", "mime_type",
  "size_bytes", "source", "status", "uploaded_at", "updated_at"
)
SELECT
  'legacy_doc_' || "id", "broker_id", "id", 'proof_of_address',
  "proof_of_address_reference", 'application/octet-stream', 0,
  "onboarding_channel", CASE WHEN "proof_of_address_status" = 'received' THEN 'recorded' ELSE "proof_of_address_status" END,
  COALESCE("submitted_at", "created_at"), CURRENT_TIMESTAMP
FROM "clients"
WHERE "proof_of_address_reference" IS NOT NULL AND length(trim("proof_of_address_reference")) > 0
ON CONFLICT ("client_id", "document_type") DO NOTHING;

INSERT INTO "linked_bank_accounts" (
  "id", "broker_id", "client_id", "bank_name", "account_number",
  "account_holder_name", "source", "status", "created_at", "updated_at"
)
SELECT
  'legacy_bank_' || "id", "broker_id", "id", "bank_name",
  "bank_account_last4", COALESCE("bank_account_name", "full_name"),
  "onboarding_channel", 'recorded', "created_at", CURRENT_TIMESTAMP
FROM "clients"
WHERE "bank_name" IS NOT NULL
  AND "bank_account_last4" IS NOT NULL
  AND length(trim("bank_account_last4")) > 0
ON CONFLICT ("client_id", "bank_name", "account_number") DO NOTHING;
