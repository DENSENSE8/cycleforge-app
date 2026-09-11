-- ============================================================================
-- 2026-09-11c: order_line_shortages + shortage_inbound_links
-- ============================================================================
-- Per-line OOS SoT. One shortage = one Zoho product short on one orders.id
-- (commercial line). orders.is_out_of_stock stays the BLOCKED hold; oos_* stays
-- a denorm of the primary open shortage for queue paint.
--
-- Earmark: shortage_inbound_links ties a shortage to a PO / receiving_line /
-- serial_unit without duplicating PO or receiving state.
--
-- Safety: writers stamp organization_id and run under withTenantTransaction.
-- Tenant-from-birth FORCE RLS is safe.
--
-- Backfill: open holds (is_out_of_stock) become shortage rows; existing
-- replenishment_order_lines attach replenishment_request_id.
--
-- ROLLBACK:
--   select relax_tenant_isolation('shortage_inbound_links');
--   select relax_tenant_isolation('order_line_shortages');
--   ALTER TABLE orders DROP COLUMN IF EXISTS oos_zoho_item_id;
--   ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_oos_kind_chk;
--   DROP TABLE IF EXISTS shortage_inbound_links;
--   DROP TABLE IF EXISTS order_line_shortages;
--
-- VERIFY (after apply): npm run tenancy:coverage
-- ============================================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS oos_zoho_item_id TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_oos_kind_chk'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_oos_kind_chk;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_oos_kind_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_oos_kind_chk
      CHECK (
        oos_kind IS NULL
        OR oos_kind IN ('listing', 'kit_part', 'catalog_child', 'catalog_other')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS order_line_shortages (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            UUID NOT NULL,
  order_id                   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  commercial_order_id        TEXT,
  zoho_item_id               TEXT NOT NULL,
  item_id                    UUID REFERENCES items(id) ON DELETE SET NULL,
  sku_catalog_id             INTEGER REFERENCES sku_catalog(id) ON DELETE SET NULL,
  kit_part_id                INTEGER,
  kind                       TEXT NOT NULL,
  qty_short                  NUMERIC(12, 2) NOT NULL DEFAULT 1,
  title                      TEXT,
  sku                        TEXT,
  status                     TEXT NOT NULL DEFAULT 'open',
  replenishment_request_id   UUID REFERENCES replenishment_requests(id) ON DELETE SET NULL,
  created_by                 TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at                 TIMESTAMPTZ,
  cleared_by                 TEXT,
  CONSTRAINT order_line_shortages_kind_chk
    CHECK (kind IN ('listing', 'kit_part', 'catalog_child', 'catalog_other')),
  CONSTRAINT order_line_shortages_status_chk
    CHECK (status IN ('open', 'on_po', 'inbound', 'received', 'allocated', 'cleared'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_order_line_shortages_open_item
  ON order_line_shortages (organization_id, order_id, zoho_item_id)
  WHERE status <> 'cleared';

CREATE INDEX IF NOT EXISTS idx_order_line_shortages_org_order
  ON order_line_shortages (organization_id, order_id);

CREATE INDEX IF NOT EXISTS idx_order_line_shortages_org_zoho
  ON order_line_shortages (organization_id, zoho_item_id)
  WHERE status <> 'cleared';

CREATE INDEX IF NOT EXISTS idx_order_line_shortages_replenish
  ON order_line_shortages (organization_id, replenishment_request_id)
  WHERE replenishment_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS shortage_inbound_links (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            UUID NOT NULL,
  shortage_id                UUID NOT NULL REFERENCES order_line_shortages(id) ON DELETE CASCADE,
  source_kind                TEXT NOT NULL,
  replenishment_request_id   UUID REFERENCES replenishment_requests(id) ON DELETE SET NULL,
  zoho_po_id                 TEXT,
  zoho_po_line_id            TEXT,
  receiving_line_id          INTEGER REFERENCES receiving_line(id) ON DELETE SET NULL,
  serial_unit_id             INTEGER REFERENCES serial_units(id) ON DELETE SET NULL,
  qty                        NUMERIC(12, 2) NOT NULL DEFAULT 1,
  link_status                TEXT NOT NULL DEFAULT 'reserved',
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shortage_inbound_links_source_chk
    CHECK (source_kind IN ('replenishment', 'po_line', 'receiving_line', 'serial_unit')),
  CONSTRAINT shortage_inbound_links_status_chk
    CHECK (link_status IN ('reserved', 'in_transit', 'received', 'unboxed', 'allocated', 'released'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_shortage_inbound_links_natural
  ON shortage_inbound_links (
    organization_id,
    shortage_id,
    source_kind,
    (COALESCE(zoho_po_id, '')),
    (COALESCE(zoho_po_line_id, '')),
    (COALESCE(receiving_line_id, 0)),
    (COALESCE(serial_unit_id, 0))
  );

CREATE INDEX IF NOT EXISTS idx_shortage_inbound_links_shortage
  ON shortage_inbound_links (organization_id, shortage_id);

CREATE INDEX IF NOT EXISTS idx_shortage_inbound_links_zoho_po
  ON shortage_inbound_links (organization_id, zoho_po_id)
  WHERE zoho_po_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shortage_inbound_links_receiving
  ON shortage_inbound_links (organization_id, receiving_line_id)
  WHERE receiving_line_id IS NOT NULL;

-- Backfill: one shortage per currently-held order line.
INSERT INTO order_line_shortages (
  organization_id,
  order_id,
  commercial_order_id,
  zoho_item_id,
  sku_catalog_id,
  kit_part_id,
  kind,
  qty_short,
  title,
  sku,
  status,
  created_by
)
SELECT
  o.organization_id,
  o.id,
  o.order_id,
  COALESCE(
    NULLIF(BTRIM(o.oos_zoho_item_id), ''),
    NULLIF(BTRIM(o.oos_sku), ''),
    NULLIF(BTRIM(o.sku), ''),
    'unlinked:' || o.id::text
  ),
  o.oos_sku_catalog_id,
  o.oos_kit_part_id,
  CASE
    WHEN o.oos_kind IN ('listing', 'kit_part', 'catalog_child', 'catalog_other') THEN o.oos_kind
    ELSE 'listing'
  END,
  COALESCE(NULLIF(o.oos_qty_short, 0), 1),
  COALESCE(NULLIF(BTRIM(o.oos_title), ''), o.product_title),
  COALESCE(NULLIF(BTRIM(o.oos_sku), ''), o.sku),
  'open',
  'backfill'
FROM orders o
WHERE o.is_out_of_stock = true
ON CONFLICT DO NOTHING;

UPDATE order_line_shortages ols
SET replenishment_request_id = rol.replenishment_request_id
FROM replenishment_order_lines rol
WHERE rol.order_id = ols.order_id
  AND rol.organization_id = ols.organization_id
  AND ols.replenishment_request_id IS NULL
  AND ols.status <> 'cleared';

UPDATE orders o
SET oos_zoho_item_id = ols.zoho_item_id
FROM order_line_shortages ols
WHERE ols.order_id = o.id
  AND ols.organization_id = o.organization_id
  AND ols.status <> 'cleared'
  AND o.oos_zoho_item_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('order_line_shortages');
    PERFORM enforce_tenant_isolation('shortage_inbound_links');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — shortage tables left without FORCE RLS';
  END IF;
END $$;

COMMIT;
