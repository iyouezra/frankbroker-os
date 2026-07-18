ALTER TABLE "clients"
  ADD COLUMN "onboarding_channel" TEXT NOT NULL DEFAULT 'in_person',
  ADD COLUMN "external_client_reference" TEXT,
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "country_of_residence" TEXT,
  ADD COLUMN "occupation" TEXT,
  ADD COLUMN "employer_name" TEXT,
  ADD COLUMN "source_of_funds" TEXT,
  ADD COLUMN "investment_objective" TEXT,
  ADD COLUMN "tax_residency" TEXT,
  ADD COLUMN "pep_status" TEXT NOT NULL DEFAULT 'not_declared',
  ADD COLUMN "bank_name" TEXT,
  ADD COLUMN "bank_account_name" TEXT,
  ADD COLUMN "bank_account_last4" TEXT,
  ADD COLUMN "phone_verified_at" TIMESTAMP(3),
  ADD COLUMN "identity_verified_at" TIMESTAMP(3);

CREATE TABLE "verification_challenges" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "account_id" TEXT,
  "purpose" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'otp',
  "destination_hint" TEXT,
  "payload_hash" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "salt" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "verified_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "verification_challenges_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "verification_challenges_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "verification_challenges_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "verification_challenges_client_id_purpose_status_idx" ON "verification_challenges"("client_id", "purpose", "status");
CREATE INDEX "verification_challenges_expires_at_status_idx" ON "verification_challenges"("expires_at", "status");

ALTER TABLE "orders"
  ADD COLUMN "instruction_verification_id" TEXT,
  ADD COLUMN "instruction_verified_at" TIMESTAMP(3),
  ADD CONSTRAINT "orders_instruction_verification_id_fkey" FOREIGN KEY ("instruction_verification_id") REFERENCES "verification_challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "orders_instruction_verification_id_key" ON "orders"("instruction_verification_id");
