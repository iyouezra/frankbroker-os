-- Retain the two additional UserInfo attributes requested for internal identity
-- records. Portrait bytes must be copied to private evidence storage; this
-- column stores only that internal storage reference, never Fayda's URL.
ALTER TABLE "investor_identities"
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "portrait_reference" TEXT;
