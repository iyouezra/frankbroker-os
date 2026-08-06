-- Defense in depth for financial snapshots and cross-tenant ownership. The
-- application already calculates these values in serializable transactions;
-- these constraints prevent a future code path or direct SQL write from
-- persisting impossible balances or joining a financial record to another
-- tenant's account.

ALTER TABLE "clients" ADD COLUMN "portal_auth_subject" TEXT;
CREATE UNIQUE INDEX "clients_broker_id_portal_auth_subject_key"
  ON "clients"("broker_id", "portal_auth_subject");

ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_cash_nonnegative" CHECK (
    "total_cash" >= 0 AND "available_cash" >= 0 AND "blocked_cash" >= 0 AND "unsettled_cash" >= 0
  ),
  ADD CONSTRAINT "accounts_cash_components_balance" CHECK (
    "total_cash" = "available_cash" + "blocked_cash" + "unsettled_cash"
  ),
  ADD CONSTRAINT "accounts_version_nonnegative" CHECK ("version" >= 0);

ALTER TABLE "holdings"
  ADD CONSTRAINT "holdings_quantity_nonnegative" CHECK (
    "total_quantity" >= 0 AND "available_quantity" >= 0 AND "blocked_quantity" >= 0 AND "unsettled_quantity" >= 0
  ),
  ADD CONSTRAINT "holdings_quantity_components_balance" CHECK (
    "total_quantity" = "available_quantity" + "blocked_quantity" + "unsettled_quantity"
  ),
  ADD CONSTRAINT "holdings_average_cost_nonnegative" CHECK ("average_cost" >= 0),
  ADD CONSTRAINT "holdings_version_nonnegative" CHECK ("version" >= 0);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_positive_instruction" CHECK (
    "quantity" > 0 AND "price" > 0 AND ("trigger_price" IS NULL OR "trigger_price" > 0)
  ),
  ADD CONSTRAINT "orders_quantity_aggregates" CHECK (
    "filled_quantity" >= 0 AND "remaining_quantity" >= 0
    AND "filled_quantity" + "remaining_quantity" = "quantity"
  ),
  ADD CONSTRAINT "orders_financial_aggregates_nonnegative" CHECK (
    "estimated_gross" >= 0 AND "estimated_fees" >= 0
    AND "executed_gross" >= 0 AND "executed_fees" >= 0
    AND "blocked_cash" >= 0 AND "blocked_quantity" >= 0
  ),
  ADD CONSTRAINT "orders_valid_side" CHECK ("side" IN ('buy', 'sell')),
  ADD CONSTRAINT "orders_version_nonnegative" CHECK ("version" >= 0);

ALTER TABLE "trades"
  ADD CONSTRAINT "trades_positive_execution" CHECK (
    "execution_price" > 0 AND "quantity_filled" > 0 AND "gross_amount" > 0
    AND "fees" >= 0 AND "net_amount" > 0
  );

ALTER TABLE "cash_movements"
  ADD CONSTRAINT "cash_movements_positive_amount" CHECK ("amount" > 0),
  ADD CONSTRAINT "cash_movements_valid_type" CHECK ("movement_type" IN ('deposit', 'withdrawal'));

ALTER TABLE "client_money_positions"
  ADD CONSTRAINT "client_money_positions_nonnegative" CHECK ("balance" >= 0 AND "version" >= 0);

ALTER TABLE "pooled_bank_accounts"
  ADD CONSTRAINT "pooled_bank_balances_nonnegative" CHECK (
    "book_balance" >= 0 AND "statement_balance" >= 0 AND "version" >= 0
  );

ALTER TABLE "verification_challenges"
  ADD CONSTRAINT "verification_attempt_bounds" CHECK (
    "attempts" >= 0 AND "max_attempts" > 0 AND "attempts" <= "max_attempts"
  );

CREATE INDEX "verification_challenges_client_id_purpose_created_at_idx"
  ON "verification_challenges"("client_id", "purpose", "created_at");

ALTER TABLE "broker_settings"
  ADD CONSTRAINT "broker_settings_financial_controls_nonnegative" CHECK (
    "approval_threshold" >= 0 AND "client_daily_limit" >= 0
    AND "brokerage_fee_pct" >= 0 AND "minimum_fee" >= 0
  );

ALTER TABLE "fee_rules"
  ADD CONSTRAINT "fee_rules_nonnegative" CHECK (
    "brokerage_pct" >= 0 AND "regulator_pct" >= 0 AND "exchange_pct" >= 0
    AND "csd_pct" >= 0 AND "minimum_fee" >= 0
    AND ("maximum_fee" IS NULL OR "maximum_fee" >= "minimum_fee")
  );

ALTER TABLE "platform_fee_rules"
  ADD CONSTRAINT "platform_fee_rules_nonnegative" CHECK (
    "regulator_pct" >= 0 AND "exchange_pct" >= 0 AND "csd_pct" >= 0
  );

ALTER TABLE "instruments"
  ADD CONSTRAINT "instruments_market_values_positive" CHECK (
    "lot_size" > 0 AND "tick_size" > 0
    AND ("last_price" IS NULL OR "last_price" > 0)
    AND ("face_value" IS NULL OR "face_value" > 0)
    AND ("coupon_rate" IS NULL OR "coupon_rate" >= 0)
  );

CREATE OR REPLACE FUNCTION frank_enforce_order_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "accounts" a
    JOIN "clients" c ON c."id" = a."client_id"
    WHERE a."id" = NEW."account_id" AND c."broker_id" = NEW."broker_id"
  ) THEN
    RAISE EXCEPTION 'order account does not belong to order tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "orders_enforce_tenant_ownership"
BEFORE INSERT OR UPDATE OF "broker_id", "account_id", "instrument_id" ON "orders"
FOR EACH ROW EXECUTE FUNCTION frank_enforce_order_tenant();

CREATE OR REPLACE FUNCTION frank_enforce_cash_movement_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "clients" c
    JOIN "accounts" a ON a."client_id" = c."id"
    JOIN "pooled_bank_accounts" p ON p."broker_id" = c."broker_id"
    WHERE c."id" = NEW."client_id"
      AND c."broker_id" = NEW."broker_id"
      AND a."id" = NEW."account_id"
      AND p."id" = NEW."pooled_bank_account_id"
  ) THEN
    RAISE EXCEPTION 'cash movement references records outside its tenant or client' USING ERRCODE = '23514';
  END IF;
  IF NEW."linked_bank_account_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "linked_bank_accounts" b
    WHERE b."id" = NEW."linked_bank_account_id"
      AND b."broker_id" = NEW."broker_id"
      AND b."client_id" = NEW."client_id"
  ) THEN
    RAISE EXCEPTION 'cash movement linked bank does not belong to its investor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "cash_movements_enforce_tenant_ownership"
BEFORE INSERT OR UPDATE OF "broker_id", "client_id", "account_id", "pooled_bank_account_id", "linked_bank_account_id" ON "cash_movements"
FOR EACH ROW EXECUTE FUNCTION frank_enforce_cash_movement_tenant();

CREATE OR REPLACE FUNCTION frank_enforce_verification_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "clients" c
    WHERE c."id" = NEW."client_id" AND c."broker_id" = NEW."broker_id"
  ) THEN
    RAISE EXCEPTION 'verification client does not belong to verification tenant' USING ERRCODE = '23514';
  END IF;
  IF NEW."account_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "accounts" a
    WHERE a."id" = NEW."account_id" AND a."client_id" = NEW."client_id"
  ) THEN
    RAISE EXCEPTION 'verification account does not belong to verification client' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "verification_challenges_enforce_tenant_ownership"
BEFORE INSERT OR UPDATE OF "broker_id", "client_id", "account_id" ON "verification_challenges"
FOR EACH ROW EXECUTE FUNCTION frank_enforce_verification_tenant();

CREATE OR REPLACE FUNCTION frank_enforce_client_evidence_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "clients" c
    WHERE c."id" = NEW."client_id" AND c."broker_id" = NEW."broker_id"
  ) THEN
    RAISE EXCEPTION 'client evidence does not belong to evidence tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "client_documents_enforce_tenant_ownership"
BEFORE INSERT OR UPDATE OF "broker_id", "client_id" ON "client_documents"
FOR EACH ROW EXECUTE FUNCTION frank_enforce_client_evidence_tenant();

CREATE TRIGGER "linked_bank_accounts_enforce_tenant_ownership"
BEFORE INSERT OR UPDATE OF "broker_id", "client_id" ON "linked_bank_accounts"
FOR EACH ROW EXECUTE FUNCTION frank_enforce_client_evidence_tenant();
