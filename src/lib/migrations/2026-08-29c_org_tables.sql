-- ============================================================================
-- 2026-08-29c — org_tables (which sheets an organization runs, and in what order)
--
-- WHAT
--   One row per table an org has ENABLED, plus its position in the bottom tab
--   strip. Plan: docs/todo/one-sheet-table-sot-PLAN.md § Phase 8.
--
-- WHY A CATALOG AND NOT A FEATURE FLAG
--   The product ships ~24 table surfaces and no org uses all of them: a
--   repair-shop tenant has no FBA lane, a 3PL has no walk-in counter. Today
--   every org sees every route the RBAC lets them, so "which tables are ours"
--   is answered by each operator's memory of which nav rows to ignore. This
--   makes it a stored, per-org fact the sheet tab strip reads.
--
-- WHY ABSENCE MEANS "ALL", NOT "NONE"
--   An org with zero rows here sees the product's default set — the same thing
--   it sees today. A table whose enablement is a row would otherwise mean that
--   applying this migration blanks every existing tenant's tab strip until
--   someone seeds it, which is a data migration wearing a DDL migration's
--   clothes. Opting OUT is what gets recorded; the default stays the default.
--   `enabled = false` is therefore meaningful and is NOT the same as no row.
--
-- WHY `table_id` IS TEXT WITH NO CHECK
--   Same reason as `table_column_formats`: the `TableId` union grows with every
--   surface, and a CHECK here would need a DROP/re-ADD follow-up per addition —
--   the constraint-drift trap `.claude/rules/polymorphic-tables.md` records. A
--   row naming an unknown table is inert: nothing resolves it, and it costs one
--   dead row. The catalog the picker offers is `REGISTERED_BINDINGS`, in code.
--
-- TENANT-FROM-BIRTH / FORCE RLS
--   organization_id NOT NULL (no DDL default; the helper installs the loud-fail
--   GUC default) + enforce_tenant_isolation in the same migration. Safe to
--   FORCE now: ZERO writers at apply time — the API lands second, per the
--   expand → code → contract ordering law.
--
-- ROLLBACK (dev only)
--   SELECT relax_tenant_isolation('org_tables');
--   DROP TABLE IF EXISTS org_tables CASCADE;
--
-- VERIFY
--   \d org_tables
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE relname = 'org_tables';   -- both t after enforce
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS org_tables (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,   -- no DDL default; enforce_tenant_isolation installs the loud-fail GUC default
  -- A `TableId` from src/lib/tables/table-columns.ts. See the header on why
  -- there is deliberately no CHECK.
  table_id         TEXT NOT NULL,
  -- FALSE is an explicit opt-out and is NOT the same as an absent row.
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  -- Position in the bottom tab strip. Ties break on table_id so the order is
  -- total and stable rather than whatever the planner returns.
  sort_order       INTEGER NOT NULL DEFAULT 0,
  updated_by       INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_tables_unique UNIQUE (organization_id, table_id)
);

-- The only read shape: "this org's catalog, in strip order". The UNIQUE
-- constraint's index already leads with organization_id, so it serves the
-- lookup; the sort is small enough (tens of rows) to happen in memory.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('org_tables');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — org_tables left without FORCE RLS';
  END IF;
END $$;

COMMENT ON TABLE org_tables IS
  'Per-org sheet catalog: which table surfaces this organization runs and their order in the bottom tab strip. No rows = the product default set (absence means ALL, not none); enabled=false is an explicit opt-out.';

COMMIT;
