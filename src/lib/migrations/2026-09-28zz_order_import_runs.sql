-- 2026-09-28zz_order_import_runs.sql
--
-- WHAT
--   The import record (docs/design-system/HANDOFF-import-history.md §3):
--     order_import_runs      — one row per import run per org (a pipeline run,
--                              a single provider "Sync now", a Sheets history
--                              backfill), with per-step counts and status.
--     order_import_run_steps — one row per step of a run (shipstation,
--                              google_sheets, square, …, exceptions).
--     order_import_run_rows  — one row per order the run touched: orders.id,
--                              external number, account, platform, source,
--                              outcome, filled fields, tracking, ShipStation
--                              ids, sheet tab:row, import exception.
--   Tenant-scoped from birth: organization_id NOT NULL on all three, every
--   index leads with it, FORCE RLS via enforce_tenant_isolation.
--
-- WHY
--   cron_runs is global and its summary is free JSON; the ids of the orders an
--   import brought in were computed by the writers and thrown away. The
--   /operations/imports page (and /m/imports) reads these tables.
--
-- WRITER (the only one)
--   src/lib/sync/import-record.ts (startImportRun / recordProviderSync) via
--   src/lib/sync/import-record-load.ts — every INSERT/UPDATE runs inside
--   withTenantTransaction(orgId, …) and stamps organization_id explicitly, so
--   FORCE RLS + the loud-fail org default are safe to enable now. Retention:
--   /api/cron/cleanup prunes runs per org under tenantQuery (steps and rows
--   cascade).
--
-- REFERENCES
--   run_id / step_id cascade from their parent. cron_run_id → cron_runs ON
--   DELETE SET NULL (the ledger ages out on its own schedule).
--   order_row_id, shipment_id and import_exception_id are deliberately NOT
--   foreign keys: a row is the historical fact of what the import did and must
--   survive the order / tracking / exception being deleted or merged later,
--   and an FK would make every orders DELETE scan this high-volume table and
--   let a concurrent delete fail a whole step's insert. Readers LEFT JOIN.
--
-- VERIFY
--   \d order_import_runs / order_import_run_steps / order_import_run_rows
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE relname LIKE 'order_import_run%';               -- t / t on all three
--   After one pipeline run: 1 run row, 1 step row per step, 1 row per order
--   the writers reported, all with the run's organization_id.
--
-- ROLLBACK
--   select relax_tenant_isolation('order_import_run_rows');
--   select relax_tenant_isolation('order_import_run_steps');
--   select relax_tenant_isolation('order_import_runs');
--   DROP TABLE IF EXISTS order_import_run_rows, order_import_run_steps, order_import_runs;
--   (revert the recorder wiring first, or it logs a warning per run)

CREATE TABLE IF NOT EXISTS order_import_runs (
  id                     BIGSERIAL PRIMARY KEY,
  organization_id        UUID NOT NULL,
  cron_run_id            BIGINT REFERENCES cron_runs(id) ON DELETE SET NULL,
  kind                   TEXT NOT NULL CHECK (kind IN ('pipeline', 'provider', 'sheets_full')),
  trigger                TEXT NOT NULL CHECK (trigger IN ('cron', 'manual')),
  triggered_by_staff_id  INTEGER,
  status                 TEXT NOT NULL DEFAULT 'running'
                           CHECK (status IN ('running', 'success', 'partial', 'failed')),
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at            TIMESTAMPTZ,
  duration_ms            INTEGER,
  counts                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  error                  TEXT
);

-- Runs list (newest first) and the cleanup cron's per-org retention delete.
CREATE INDEX IF NOT EXISTS idx_order_import_runs_org_started
  ON order_import_runs (organization_id, started_at DESC);
-- cron_runs retention: the ON DELETE SET NULL lookup.
CREATE INDEX IF NOT EXISTS idx_order_import_runs_cron_run
  ON order_import_runs (cron_run_id) WHERE cron_run_id IS NOT NULL;

COMMENT ON TABLE order_import_runs IS
  'Import record: one row per import run per org. Only writer: src/lib/sync/import-record.ts. Read by /operations/imports.';

CREATE TABLE IF NOT EXISTS order_import_run_steps (
  id               BIGSERIAL PRIMARY KEY,
  run_id           BIGINT NOT NULL REFERENCES order_import_runs(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL,
  step             TEXT NOT NULL,
  ok               BOOLEAN NOT NULL,
  counts           JSONB NOT NULL DEFAULT '{}'::jsonb,
  error            TEXT,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_order_import_run_steps_org_run
  ON order_import_run_steps (organization_id, run_id);
-- Cascade from order_import_runs deletes by run_id alone.
CREATE INDEX IF NOT EXISTS idx_order_import_run_steps_run
  ON order_import_run_steps (run_id);

COMMENT ON TABLE order_import_run_steps IS
  'Import record: one row per step (shipstation, google_sheets, <channel>, exceptions) of an order_import_runs row.';

CREATE TABLE IF NOT EXISTS order_import_run_rows (
  id                       BIGSERIAL PRIMARY KEY,
  run_id                   BIGINT NOT NULL REFERENCES order_import_runs(id) ON DELETE CASCADE,
  step_id                  BIGINT REFERENCES order_import_run_steps(id) ON DELETE CASCADE,
  organization_id          UUID NOT NULL,
  order_row_id             INTEGER,
  external_order_id        TEXT NOT NULL,
  account_source           TEXT,
  platform                 TEXT,
  source                   TEXT NOT NULL,
  outcome                  TEXT NOT NULL CHECK (outcome IN (
                             'inserted', 'backfilled', 'adopted', 'claimed', 'tracking_filled',
                             'unchanged', 'ambiguous', 'quarantined', 'skipped', 'failed')),
  reason                   TEXT,
  filled_fields            TEXT[] NOT NULL DEFAULT '{}',
  tracking_number          TEXT,
  shipment_id              BIGINT,
  sku_catalog_id           INTEGER,
  item_number              TEXT,
  shipstation_order_id     BIGINT,
  shipstation_shipment_id  BIGINT,
  sheet_tab                TEXT,
  sheet_row                INTEGER,
  import_exception_id      BIGINT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_import_run_rows_org_run
  ON order_import_run_rows (organization_id, run_id);
CREATE INDEX IF NOT EXISTS idx_order_import_run_rows_org_order_row
  ON order_import_run_rows (organization_id, order_row_id);
CREATE INDEX IF NOT EXISTS idx_order_import_run_rows_org_external
  ON order_import_run_rows (organization_id, external_order_id);
CREATE INDEX IF NOT EXISTS idx_order_import_run_rows_org_created
  ON order_import_run_rows (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_import_run_rows_org_outcome
  ON order_import_run_rows (organization_id, outcome);
CREATE INDEX IF NOT EXISTS idx_order_import_run_rows_org_source
  ON order_import_run_rows (organization_id, source);
-- Cascades from runs / steps delete by run_id / step_id alone.
CREATE INDEX IF NOT EXISTS idx_order_import_run_rows_run
  ON order_import_run_rows (run_id);
CREATE INDEX IF NOT EXISTS idx_order_import_run_rows_step
  ON order_import_run_rows (step_id);

COMMENT ON TABLE order_import_run_rows IS
  'Import record: one row per order an import run touched (orders.id, external number, source, outcome, filled fields). Titles are never stored here — read through resolveSkuIdentityTitle.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('order_import_runs');
    PERFORM enforce_tenant_isolation('order_import_run_steps');
    PERFORM enforce_tenant_isolation('order_import_run_rows');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — order_import_run* left without FORCE RLS';
  END IF;
END $$;
