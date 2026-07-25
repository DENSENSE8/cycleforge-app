-- ============================================================================
-- 2026-07-24_order_catalog_link_chores.sql
--
-- Review · Catalog link queue for Google Sheets order imports whose Item Number
-- is present but does not resolve to an existing sku_catalog / sku_platform_ids
-- row. Operators link the listing once to a Zoho/catalog SoT on
-- /review?mode=catalog-link; that backfills all matching orders.
--
-- Explicit enqueue-only: historical null-catalog orphans are NEVER scanned into
-- this table. Rows appear only when transfer-orders upserts on a catalog miss.
--
-- Safety gating: brand-new table. Writers (transfer-orders + Review APIs) stamp
-- organization_id and run under withTenantTransaction / tenantQuery, so
-- tenant-from-birth FORCE RLS is safe immediately.
--
-- ROLLBACK:
--   select relax_tenant_isolation('order_catalog_link_chores');
--   DROP TABLE IF EXISTS order_catalog_link_chores;
--
-- VERIFY (after apply): npm run tenancy:coverage
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS order_catalog_link_chores (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  item_number         TEXT NOT NULL,
  account_source      TEXT NOT NULL DEFAULT '',
  product_title       TEXT,
  sku                 TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
  sku_catalog_id      INTEGER REFERENCES sku_catalog(id) ON DELETE SET NULL,
  order_count         INTEGER NOT NULL DEFAULT 1,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_at           TIMESTAMPTZ,
  ignored_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE order_catalog_link_chores ADD CONSTRAINT order_catalog_link_chores_status_chk
    CHECK (status IN ('open', 'linked', 'ignored'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Per-org uniqueness: one chore per listing identity. Re-imports bump order_count.
CREATE UNIQUE INDEX IF NOT EXISTS ux_order_catalog_link_chores_org_item_source
  ON order_catalog_link_chores (organization_id, item_number, account_source);

CREATE INDEX IF NOT EXISTS ix_order_catalog_link_chores_org_open
  ON order_catalog_link_chores (organization_id, last_seen_at DESC)
  WHERE status = 'open';

COMMENT ON TABLE order_catalog_link_chores IS
  'Review Catalog-link steward queue. Enqueued only on sheet import when Item Number misses sku_catalog/sku_platform_ids. Not a scan of historical orphans.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('order_catalog_link_chores');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — order_catalog_link_chores left without FORCE RLS';
  END IF;
END $$;

COMMIT;
