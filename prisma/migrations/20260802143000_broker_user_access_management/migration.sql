-- Broker-owned workforce access lifecycle. Authentication credentials remain
-- with the future identity provider; Frank stores only provisioning metadata.
ALTER TABLE "users"
  ADD COLUMN "employee_id" TEXT,
  ADD COLUMN "job_title" TEXT,
  ADD COLUMN "department" TEXT,
  ADD COLUMN "auth_provider" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "auth_provider_id" TEXT,
  ADD COLUMN "invited_at" TIMESTAMP(3),
  ADD COLUMN "invitation_expires_at" TIMESTAMP(3),
  ADD COLUMN "password_reset_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "password_reset_requested_at" TIMESTAMP(3),
  ADD COLUMN "access_review_due_at" TIMESTAMP(3),
  ADD COLUMN "deactivated_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_broker_id_employee_id_key" ON "users"("broker_id", "employee_id");
DROP INDEX "users_broker_id_idx";
CREATE INDEX "users_broker_id_status_idx" ON "users"("broker_id", "status");
