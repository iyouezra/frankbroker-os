-- WebAuthn credentials contain public keys only. Biometric templates and
-- private keys stay within the investor's device or credential provider.
CREATE TABLE "investor_passkeys" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "credential_id" TEXT NOT NULL,
  "public_key" BYTEA NOT NULL,
  "webauthn_user_id" TEXT NOT NULL,
  "counter" BIGINT NOT NULL DEFAULT 0,
  "device_type" TEXT NOT NULL,
  "backed_up" BOOLEAN NOT NULL DEFAULT false,
  "transports" JSONB,
  "label" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "investor_passkeys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "investor_passkey_challenges" (
  "id" TEXT NOT NULL,
  "broker_id" TEXT,
  "client_id" TEXT,
  "passkey_id" TEXT,
  "purpose" TEXT NOT NULL,
  "challenge" TEXT NOT NULL,
  "rp_id" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "payload_hash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "verified_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "investor_passkey_challenges_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "verification_challenges"
  ADD COLUMN "pre_auth_method" TEXT,
  ADD COLUMN "pre_auth_reference" TEXT;

CREATE UNIQUE INDEX "investor_passkeys_credential_id_key" ON "investor_passkeys"("credential_id");
CREATE INDEX "investor_passkeys_broker_id_client_id_revoked_at_idx" ON "investor_passkeys"("broker_id", "client_id", "revoked_at");
CREATE UNIQUE INDEX "investor_passkey_challenges_challenge_key" ON "investor_passkey_challenges"("challenge");
CREATE INDEX "investor_passkey_challenges_client_id_purpose_status_idx" ON "investor_passkey_challenges"("client_id", "purpose", "status");
CREATE INDEX "investor_passkey_challenges_expires_at_status_idx" ON "investor_passkey_challenges"("expires_at", "status");

ALTER TABLE "investor_passkeys" ADD CONSTRAINT "investor_passkeys_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "investor_passkeys" ADD CONSTRAINT "investor_passkeys_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "investor_passkey_challenges" ADD CONSTRAINT "investor_passkey_challenges_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "brokers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "investor_passkey_challenges" ADD CONSTRAINT "investor_passkey_challenges_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "investor_passkey_challenges" ADD CONSTRAINT "investor_passkey_challenges_passkey_id_fkey" FOREIGN KEY ("passkey_id") REFERENCES "investor_passkeys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
