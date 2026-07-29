-- ============================================================================
-- 2026-07-29a — square_transactions tenancy contract (EXPAND phase)
--
-- Closes the follow-ups the 2026-06-14_org_id_phase_b_needs_col.sql header
-- listed for this table. That migration added organization_id NULLABLE on
-- purpose, because the session-less webhook writer
-- (src/app/api/webhooks/square/route.ts) was not yet threading an org and a
-- NOT NULL + GUC-default column would have loud-failed every Square event.
--
-- STATE WHEN THIS WAS WRITTEN (verified against the live DB, not inferred from
-- comments — the module comment in square-transaction-queries.ts was stale and
-- claimed the column did not exist at all):
--
--   organization_id  uuid NOT NULL
--                    DEFAULT NULLIF(current_setting('app.current_org', true), '')::uuid
--   RLS              ENABLED and FORCED, policy `tenant_isolation` on ALL
--   constraints      square_transactions_square_order_id_key UNIQUE (square_order_id)
--   rows             50, 0 with a NULL org, 1 distinct org
--
-- So follow-ups (1) thread the webhook and (2) SET NOT NULL are already live.
-- Steps 1–2 below are therefore no-ops against this database and are kept only
-- so the file is self-contained and correct when replayed onto a fresh DB.
--
-- The follow-up that is genuinely OUTSTANDING is (4): the upsert still conflicts
-- on the GLOBAL UNIQUE (square_order_id). Two tenants cannot both mirror the
-- same Square order id, and under FORCE RLS with the app_tenant role that is a
-- hard failure rather than a merge — tenant B's upsert collides with a row it
-- cannot see, so it can neither conflict-resolve nor insert.
--
-- EXPAND / CONTRACT, per 2026-06-28j_sku_catalog_add_composite_unique.sql:
-- this file ADDS the composite UNIQUE alongside the legacy global one, so
-- old code (ON CONFLICT (square_order_id)) and new code
-- (ON CONFLICT (organization_id, square_order_id)) both work during rollout.
-- The legacy drop is the separate contract migration
-- 2026-07-29a_square_transactions_composite_unique.sql.gated.
--
-- ⚠️ APPLY BEFORE DEPLOYING the matching code change in
--    src/lib/neon/square-transaction-queries.ts. That module now conflicts on
--    (organization_id, square_order_id); without this constraint every upsert
--    throws "no unique or exclusion constraint matching the ON CONFLICT
--    specification".
--
-- Safe on current data: 0 NULL-org rows and square_order_id is already globally
-- unique, so (organization_id, square_order_id) is unique a fortiori — adding
-- the constraint cannot fail. PK is unaffected (id uuid).
--
-- Idempotent (guarded DO-blocks throughout) and roll-forward only.
-- ============================================================================

BEGIN;

-- 1. Backfill any residual NULL org to the dogfood tenant. No-op today (0 rows);
--    required before SET NOT NULL on a database that replayed the nullable add.
UPDATE square_transactions
   SET organization_id = '00000000-0000-0000-0000-000000000001'
 WHERE organization_id IS NULL;

-- 2. SET NOT NULL. Already satisfied live; ALTER is a no-op when the column is
--    already NOT NULL, so this stays re-runnable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'square_transactions'
      AND column_name = 'organization_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE square_transactions ALTER COLUMN organization_id SET NOT NULL;
    RAISE NOTICE 'square_transactions.organization_id -> NOT NULL';
  ELSE
    RAISE NOTICE 'square_transactions.organization_id already NOT NULL — skipping';
  END IF;
END $$;

-- 3. The per-org composite UNIQUE, ADDED ALONGSIDE the legacy global one.
--    This is the constraint the new ON CONFLICT target binds to.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'square_transactions'::regclass
      AND conname = 'square_transactions_org_order_key'
  ) THEN
    ALTER TABLE square_transactions
      ADD CONSTRAINT square_transactions_org_order_key
      UNIQUE (organization_id, square_order_id);
    RAISE NOTICE 'added square_transactions_org_order_key';
  END IF;
END $$;

COMMIT;
