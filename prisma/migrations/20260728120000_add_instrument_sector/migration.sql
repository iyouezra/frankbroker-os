ALTER TABLE "instruments"
ADD COLUMN "sector" TEXT;

UPDATE "instruments"
SET "sector" = CASE
  WHEN "symbol" = 'TELE' THEN 'Telecom'
  WHEN "symbol" IN ('AWAB', 'WGBX', 'GDAB', 'ABAYB') THEN 'Banks'
  ELSE NULL
END;
