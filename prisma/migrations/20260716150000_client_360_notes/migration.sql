ALTER TABLE "accounts"
  ADD COLUMN "csd_reference" TEXT;

CREATE TABLE "client_notes" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "note_text" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "visibility" TEXT NOT NULL DEFAULT 'internal',
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_notes_client_id_created_at_idx"
  ON "client_notes"("client_id", "created_at");

ALTER TABLE "client_notes"
  ADD CONSTRAINT "client_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_notes"
  ADD CONSTRAINT "client_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
