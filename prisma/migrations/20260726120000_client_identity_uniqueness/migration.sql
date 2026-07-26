-- Prevent the same legal identity being onboarded twice at one broker.
-- identity_reference is a deterministic hash of the Fayda FAN (individuals) or
-- business registration number (organizations); NULLs remain distinct in
-- Postgres, so pre-hash legacy rows are unaffected.
CREATE UNIQUE INDEX "clients_broker_id_identity_reference_key" ON "clients"("broker_id", "identity_reference");
