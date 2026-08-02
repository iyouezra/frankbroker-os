-- Backfill clearly labelled screening fixtures for trade-ready Abyssinia demo clients.
-- Incomplete, restricted, review-due, and rejected demo scenarios remain unchanged.
INSERT INTO "client_screenings" (
  "id",
  "broker_id",
  "client_id",
  "screening_type",
  "provider",
  "result",
  "reference",
  "notes",
  "screened_at",
  "recorded_by",
  "created_at"
)
SELECT
  'SCR-DEMO-BACKFILL-' || client."id",
  client."broker_id",
  client."id",
  'sanctions_pep',
  'Frank demo screening fixture',
  'clear',
  'DEMO-SCR-' || client."client_code",
  'Demonstration evidence only. Not produced by an external screening provider.',
  COALESCE(client."approved_at", client."submitted_at", client."created_at"),
  'usr_compliance',
  CURRENT_TIMESTAMP
FROM "clients" AS client
WHERE client."broker_id" = 'brk_abyssinia'
  AND (
    (client."status" = 'active' AND client."kyc_status" = 'approved')
    OR client."id" = 'cli_pending_ready'
  )
  AND EXISTS (
    SELECT 1
    FROM "users" AS compliance_user
    WHERE compliance_user."id" = 'usr_compliance'
      AND compliance_user."broker_id" = client."broker_id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "client_screenings" AS screening
    WHERE screening."client_id" = client."id"
  );
