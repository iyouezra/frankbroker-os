-- Keep external authentication identifiers separate from the client profile.
-- This allows Frank OTP and Fayda/eSignet to bind to the same internal investor
-- without treating an email address, phone number, or Fayda `sub` as a role.
CREATE TABLE "investor_identities" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "assurance_context" TEXT,
  "authentication_methods" JSONB,
  "verified_at" TIMESTAMP(3) NOT NULL,
  "last_login_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "investor_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "investor_identities_provider_issuer_subject_key"
  ON "investor_identities"("provider", "issuer", "subject");
CREATE UNIQUE INDEX "investor_identities_client_id_provider_issuer_key"
  ON "investor_identities"("client_id", "provider", "issuer");
CREATE INDEX "investor_identities_broker_id_client_id_idx"
  ON "investor_identities"("broker_id", "client_id");

ALTER TABLE "investor_identities"
  ADD CONSTRAINT "investor_identities_broker_id_fkey"
  FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "investor_identities"
  ADD CONSTRAINT "investor_identities_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
