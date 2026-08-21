ALTER TABLE "orders"
ADD COLUMN "good_till_date" DATE;

UPDATE "orders"
SET "validity" = CASE
  WHEN LOWER(REPLACE(REPLACE("validity", '-', '_'), ' ', '_')) IN ('gtc', 'good_till_cancelled', 'good_till_canceled') THEN 'gtc'
  -- Legacy "Good till date" instructions carried no actual date, so they
  -- cannot safely be reconstructed as GTD orders.
  ELSE 'day'
END;

ALTER TABLE "orders"
ADD CONSTRAINT "orders_validity_check" CHECK ("validity" IN ('day', 'gtc', 'gtd')),
ADD CONSTRAINT "orders_gtd_date_check" CHECK (
  ("validity" = 'gtd' AND "good_till_date" IS NOT NULL)
  OR ("validity" <> 'gtd' AND "good_till_date" IS NULL)
),
ADD CONSTRAINT "orders_market_day_check" CHECK (
  LOWER(REPLACE(REPLACE("order_type", '-', '_'), ' ', '_')) <> 'market'
  OR "validity" = 'day'
);
