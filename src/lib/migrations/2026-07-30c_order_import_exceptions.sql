-- ============================================================================
-- 2026-07-30c_order_import_exceptions.sql
--
-- Review · Missing item number queue. Google Sheets order import rows with a
-- real order id + tracking but a BLANK Item Number never become `orders` rows
-- at all (`noItemNumber` in transfer-sheet-eligibility.ts) — until now they
-- only ever appeared in the sync dialog's SkippedRowsPanel and vanished the
-- moment it closed. This table is the durable, per-org, sortable-by-recency
-- home for them, surfaced on /review?mode=catalog-link.
--
-- Sibling of order_catalog_link_chores (2026-07-24_order_catalog_link_chores.sql),
-- same enqueue-only discipline: rows appear only when a sheet import hits the
-- gate, never a scan of historical orphans.
--
-- raw_row + col_indices are stored together so "resolve" can splice the
-- operator-supplied Item Number into the ORIGINAL cell and re-run the same
-- pure mapSheetRowsToCanonicalLines + ingestCanonicalOrders path the bulk
-- import uses — no second order-creation code path.
--
-- Safety gating: brand-new table. The only writer (google-sheets-transfer-orders.ts)
-- stamps organization_id and runs under tenantQuery/withTenantTransaction, so
-- tenant-from-birth FORCE RLS is safe immediately.
--
-- ROLLBACK:
--   select relax_tenant_isolation('order_import_exceptions');
--   DROP TABLE IF EXISTS order_import_exceptions;
--
-- VERIFY (after apply): npm run tenancy:coverage
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS order_import_exceptions (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       UUID NOT NULL,
  account_order_id      TEXT NOT NULL,
  account_source        TEXT NOT NULL DEFAULT '',
  product_title         TEXT,
  tracking              TEXT,
  reason                TEXT NOT NULL DEFAULT 'no_item_number',
  status                TEXT NOT NULL DEFAULT 'open',
  raw_row               JSONB NOT NULL,
  col_indices           JSONB NOT NULL,
  sheet_row             INTEGER,
  resolved_item_number  TEXT,
  resolved_order_id     INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count            INTEGER NOT NULL DEFAULT 1,
  resolved_at           TIMESTAMPTZ,
  ignored_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE order_import_exceptions ADD CONSTRAINT order_import_exceptions_reason_chk
    CHECK (reason IN ('no_item_number'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE order_import_exceptions ADD CONSTRAINT order_import_exceptions_status_chk
    CHECK (status IN ('open', 'resolved', 'ignored'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Per-org uniqueness: one exception row per underlying sale. Re-syncs (the
-- source sheet cell is never edited by this feature) bump seen_count/last_seen
-- while still open, and leave a resolved/ignored row alone (see the writer's
-- `WHERE status = 'open'` upsert guard — reopening on every future sync would
-- mean the queue never empties).
CREATE UNIQUE INDEX IF NOT EXISTS ux_order_import_exceptions_org_source_order
  ON order_import_exceptions (organization_id, account_source, account_order_id);

CREATE INDEX IF NOT EXISTS ix_order_import_exceptions_org_open
  ON order_import_exceptions (organization_id, last_seen_at DESC)
  WHERE status = 'open';

COMMENT ON TABLE order_import_exceptions IS
  'Review Missing-item-number queue. Enqueued only on sheet import when a row has a real order id + tracking but a blank Item Number. Not a scan of historical orphans.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('order_import_exceptions');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — order_import_exceptions left without FORCE RLS';
  END IF;
END $$;

COMMIT;
