-- =============================================================================
-- Row-level security (defense in depth — the API also scopes every query by tenant).
-- The runtime role (csp2all_app) is not the table owner, so policies apply to it.
-- Context is set per transaction with set_config(..., true):
--   app.tenant_id  — active tenant
--   app.user_id    — authenticated user (for listing own memberships/tenants)
--   app.rls_bypass — 'on' only inside explicit platform/system contexts
-- =============================================================================
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_rls_bypass() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.rls_bypass', true), '') = 'on' $$;

ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "branches" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "memberships" USING ("tenantId" = app_current_tenant() OR "userId" = app_current_user() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR "userId" = app_current_user() OR app_rls_bypass());
ALTER TABLE "tenant_counters" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_counters" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "tenant_services" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_services" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "custom_service_definitions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "custom_service_definitions" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "customers" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "service_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "service_records" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "record_status_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "record_status_events" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "attachments" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "follow_up_tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "follow_up_tasks" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "collections" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "payment_allocations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payment_allocations" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "expenses" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "commission_receipts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "commission_receipts" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "ledger_accounts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ledger_accounts" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "journal_entries" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "journal_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "journal_lines" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "daily_closings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "daily_closings" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscriptions" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "subscription_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscription_events" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "entitlement_overrides" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "entitlement_overrides" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "usage_counters" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "usage_adjustments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "usage_adjustments" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "payment_submissions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payment_submissions" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "connector_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "connector_configs" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "provider_operations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "provider_operations" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "provider_operation_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "provider_operation_events" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "reconciliation_runs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "reconciliation_runs" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "reconciliation_exceptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "reconciliation_exceptions" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "notifications" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "export_jobs" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());
ALTER TABLE "support_access_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "support_access_sessions" USING ("tenantId" = app_current_tenant() OR app_rls_bypass()) WITH CHECK ("tenantId" = app_current_tenant() OR app_rls_bypass());

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenants"
  USING ("id" = app_current_tenant() OR app_rls_bypass()
         OR EXISTS (SELECT 1 FROM "memberships" m WHERE m."tenantId" = "tenants"."id" AND m."userId" = app_current_user()))
  WITH CHECK ("id" = app_current_tenant() OR app_rls_bypass());

-- Audit events: readable in own tenant (or platform context); inserts always allowed (append-only).
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON "audit_events" FOR SELECT USING ("tenantId" = app_current_tenant() OR app_rls_bypass());
CREATE POLICY audit_insert ON "audit_events" FOR INSERT WITH CHECK (true);

-- =============================================================================
-- Money sanity constraints
-- =============================================================================
ALTER TABLE "service_records"
  ADD CONSTRAINT service_records_money_nonneg CHECK (
    "principalPaise" >= 0 AND "customerFeePaise" >= 0 AND "expectedCommissionPaise" >= 0
    AND "receivedCommissionPaise" >= 0 AND "amountCollectedPaise" >= 0 AND "amountAllocatedPaise" >= 0
    AND "amountDuePaise" >= 0);
ALTER TABLE "collections" ADD CONSTRAINT collections_amount_pos CHECK ("amountPaise" > 0);
ALTER TABLE "payment_allocations" ADD CONSTRAINT allocations_amount_pos CHECK ("amountPaise" > 0);
ALTER TABLE "expenses" ADD CONSTRAINT expenses_amount_pos CHECK ("amountPaise" > 0);
ALTER TABLE "usage_counters" ADD CONSTRAINT usage_nonneg CHECK ("count" >= 0);

-- =============================================================================
-- Double-entry integrity
-- =============================================================================
ALTER TABLE "journal_lines"
  ADD CONSTRAINT journal_lines_one_side CHECK (
    "debitPaise" >= 0 AND "creditPaise" >= 0 AND (("debitPaise" = 0) <> ("creditPaise" = 0)));

-- Deferred check: at commit, every touched entry must balance and have at least two lines.
CREATE OR REPLACE FUNCTION journal_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d bigint; c bigint; n int;
BEGIN
  SELECT coalesce(sum("debitPaise"),0), coalesce(sum("creditPaise"),0), count(*)
    INTO d, c, n FROM "journal_lines" WHERE "entryId" = NEW."entryId";
  IF d <> c OR n < 2 OR d = 0 THEN
    RAISE EXCEPTION 'UNBALANCED_ENTRY: entry % debits % credits % lines %', NEW."entryId", d, c, n
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT ON "journal_lines" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_entry_balanced();

-- Posted journal history is immutable. Corrections are compensating entries.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_ROW: % on % is not allowed', TG_OP, TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER journal_lines_immutable BEFORE UPDATE OR DELETE ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER record_status_events_immutable BEFORE UPDATE OR DELETE ON "record_status_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER payment_allocations_immutable BEFORE UPDATE OR DELETE ON "payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER provider_operation_events_immutable BEFORE UPDATE OR DELETE ON "provider_operation_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER subscription_events_immutable BEFORE UPDATE OR DELETE ON "subscription_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Journal entries: only the one-time link to a reversing entry may be set.
CREATE OR REPLACE FUNCTION journal_entries_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_ROW: DELETE on journal_entries is not allowed' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."reversedByEntryId" IS NOT NULL
     OR NEW."reversedByEntryId" IS NULL
     OR (to_jsonb(NEW) - 'reversedByEntryId') <> (to_jsonb(OLD) - 'reversedByEntryId') THEN
    RAISE EXCEPTION 'IMMUTABLE_ROW: journal entry % can only be linked to a reversal once', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_entries_immutable BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION journal_entries_guard();

-- No postings into a closed business day.
CREATE OR REPLACE FUNCTION journal_entries_open_day() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "daily_closings" dc
             WHERE dc."tenantId" = NEW."tenantId" AND dc."businessDate" = NEW."businessDate"
               AND dc."status" IN ('CLOSED', 'REOPEN_REQUESTED')) THEN
    RAISE EXCEPTION 'DAY_CLOSED: % is closed for tenant %', NEW."businessDate", NEW."tenantId"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_entries_open_day BEFORE INSERT ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION journal_entries_open_day();

-- Lines must share their entry's business date and tenant.
CREATE OR REPLACE FUNCTION journal_lines_match_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bd date;
BEGIN
  SELECT "businessDate" INTO bd FROM "journal_entries" WHERE "id" = NEW."entryId" AND "tenantId" = NEW."tenantId";
  IF bd IS NULL OR bd <> NEW."businessDate" THEN
    RAISE EXCEPTION 'journal line business date must match its entry' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_lines_match_entry BEFORE INSERT ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION journal_lines_match_entry();

-- =============================================================================
-- Privileges for the runtime role (if present). Append-only tables lose UPDATE/DELETE.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csp2all_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO csp2all_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO csp2all_app;
    REVOKE UPDATE, DELETE ON "journal_lines", "audit_events", "record_status_events",
      "payment_allocations", "provider_operation_events", "subscription_events" FROM csp2all_app;
    REVOKE DELETE ON "journal_entries", "collections", "expenses", "commission_receipts",
      "service_records", "daily_closings" FROM csp2all_app;
    IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
      REVOKE ALL ON "_prisma_migrations" FROM csp2all_app;
    END IF;
  END IF;
END $$;
