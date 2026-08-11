CREATE TABLE "cash_movement_proofs" (
  "cash_movement_id" TEXT NOT NULL,
  "original_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movement_proofs_pkey" PRIMARY KEY ("cash_movement_id")
);

ALTER TABLE "cash_movement_proofs"
ADD CONSTRAINT "cash_movement_proofs_cash_movement_id_fkey"
FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
