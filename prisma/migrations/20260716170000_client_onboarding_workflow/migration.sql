ALTER TABLE "clients"
  ADD COLUMN "created_by" TEXT,
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "approved_by" TEXT,
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "rejection_reason" TEXT;

CREATE INDEX "clients_status_kyc_status_idx"
  ON "clients"("status", "kyc_status");

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clients"
  ADD CONSTRAINT "clients_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
