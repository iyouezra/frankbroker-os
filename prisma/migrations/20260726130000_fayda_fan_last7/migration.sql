-- Fayda now stores the last seven digits (of the 16-digit FAN) instead of four,
-- so the masked reference stays distinguishable at scale. Rename preserves data.
ALTER TABLE "clients" RENAME COLUMN "fayda_last4" TO "fayda_last7";
