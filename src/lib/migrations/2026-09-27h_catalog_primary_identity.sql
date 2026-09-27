-- ============================================================================
-- 2026-09-27h: sku_catalog.id is the item identity; Zoho ids become facts
-- ============================================================================
-- Operator ruling 2026-09-27: everything is imported and acknowledged inside
-- CycleForge; no external inventory system (Zoho) is the source of truth.
-- This is DEMOTION, not removal — zoho_item_id columns stay readable for the
-- dual-key window (Zoho-origin POs still physically arriving match on either
-- key) and are dropped only after the cutover test passes on every reader.
--
--   1. catalog_external_ids — the ONE crosswalk from an internal catalog
--      item to every external inventory / accounting id (Zoho item id today).
--      Not sku_platform_ids: that table is SALES-CHANNEL listings, guarded by
--      guard_listing_binding_sellable() (inactive / provisional items cannot
--      bind) — an inventory-system id is not a listing and must record for
--      every catalog row. Sources: sku_catalog.provider_item_id, then items
--      (org + exact sku).
--   2. order_line_shortages: sku_catalog_id backfilled from the crosswalk
--      and made a key — (org, order_id, sku_catalog_id) unique while open.
--   3. replenishment_requests: sku_catalog_id + supplier_id + inbound_order_id,
--      so a replenishment is an internal inbound order first, a Zoho PO only
--      when exported.
--   4. shortage_inbound_links: inbound_order_id, so an earmark names the
--      internal order (and its receiving_line) instead of a Zoho PO id.
--
-- Additive only. Duplicate checks run before each new unique index.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS ux_order_line_shortages_open_catalog;
--   DROP INDEX IF EXISTS idx_order_line_shortages_org_catalog;
--   ALTER TABLE replenishment_requests DROP COLUMN IF EXISTS sku_catalog_id,
--     DROP COLUMN IF EXISTS supplier_id, DROP COLUMN IF EXISTS inbound_order_id;
--   ALTER TABLE shortage_inbound_links DROP COLUMN IF EXISTS inbound_order_id;
--   select relax_tenant_isolation('catalog_external_ids');
--   DROP TABLE IF EXISTS catalog_external_ids;
-- ============================================================================

-- ── 1. The internal-item ↔ external-id crosswalk ───────────────────────────
CREATE TABLE IF NOT EXISTS catalog_external_ids (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,
  sku_catalog_id   INTEGER NOT NULL REFERENCES sku_catalog(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,
  external_id      TEXT NOT NULL,
  external_sku     TEXT,
  external_name    TEXT,
  source           TEXT NOT NULL DEFAULT 'manual',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT catalog_external_ids_provider_chk
    CHECK (provider IN ('zoho', 'shopify', 'quickbooks', 'netsuite', 'other')),
  CONSTRAINT catalog_external_ids_id_chk CHECK (btrim(external_id) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_catalog_external_ids_provider
  ON catalog_external_ids (organization_id, provider, external_id);

CREATE INDEX IF NOT EXISTS idx_catalog_external_ids_item
  ON catalog_external_ids (organization_id, sku_catalog_id, provider);

INSERT INTO catalog_external_ids (organization_id, sku_catalog_id, provider, external_id, external_sku, source)
SELECT sc.organization_id, sc.id, 'zoho', btrim(sc.provider_item_id), sc.sku, 'backfill-2026-09-27h'
  FROM sku_catalog sc
 WHERE NULLIF(btrim(sc.provider_item_id), '') IS NOT NULL
ON CONFLICT (organization_id, provider, external_id) DO NOTHING;

INSERT INTO catalog_external_ids (organization_id, sku_catalog_id, provider, external_id, external_sku, external_name, source)
SELECT DISTINCT ON (i.organization_id, btrim(i.zoho_item_id))
       i.organization_id, sc.id, 'zoho', btrim(i.zoho_item_id), i.sku, i.name, 'backfill-2026-09-27h'
  FROM items i
  JOIN sku_catalog sc
    ON sc.organization_id = i.organization_id AND sc.sku = i.sku
 WHERE NULLIF(btrim(i.zoho_item_id), '') IS NOT NULL
 ORDER BY i.organization_id, btrim(i.zoho_item_id), sc.id
ON CONFLICT (organization_id, provider, external_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('catalog_external_ids');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — catalog_external_ids left without FORCE RLS';
  END IF;
END $$;

-- ── 2. Shortages keyed on the catalog item ─────────────────────────────────
UPDATE order_line_shortages s
   SET sku_catalog_id = x.sku_catalog_id
  FROM catalog_external_ids x
 WHERE s.sku_catalog_id IS NULL
   AND x.organization_id = s.organization_id
   AND x.provider = 'zoho'
   AND x.external_id = s.zoho_item_id;

UPDATE order_line_shortages s
   SET sku_catalog_id = sc.id
  FROM sku_catalog sc
 WHERE s.sku_catalog_id IS NULL
   AND NULLIF(btrim(s.sku), '') IS NOT NULL
   AND sc.organization_id = s.organization_id
   AND sc.sku = s.sku;

DO $$
DECLARE dup integer;
BEGIN
  SELECT count(*) INTO dup FROM (
    SELECT 1 FROM order_line_shortages
     WHERE status <> 'cleared' AND sku_catalog_id IS NOT NULL
     GROUP BY organization_id, order_id, sku_catalog_id HAVING count(*) > 1
  ) d;
  IF dup > 0 THEN
    RAISE EXCEPTION 'order_line_shortages has % open duplicate (order, catalog item) group(s)', dup;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_order_line_shortages_open_catalog
  ON order_line_shortages (organization_id, order_id, sku_catalog_id)
  WHERE status <> 'cleared' AND sku_catalog_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_line_shortages_org_catalog
  ON order_line_shortages (organization_id, sku_catalog_id)
  WHERE status <> 'cleared';

-- ── 3. Replenishment is internal-first ─────────────────────────────────────
ALTER TABLE replenishment_requests
  ADD COLUMN IF NOT EXISTS sku_catalog_id INTEGER REFERENCES sku_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inbound_order_id BIGINT REFERENCES inbound_order(id) ON DELETE SET NULL;

UPDATE replenishment_requests r
   SET sku_catalog_id = x.sku_catalog_id
  FROM catalog_external_ids x
 WHERE r.sku_catalog_id IS NULL
   AND x.organization_id = r.organization_id
   AND x.provider = 'zoho'
   AND x.external_id = r.zoho_item_id;

UPDATE replenishment_requests r
   SET sku_catalog_id = sc.id
  FROM sku_catalog sc
 WHERE r.sku_catalog_id IS NULL
   AND NULLIF(btrim(r.sku), '') IS NOT NULL
   AND sc.organization_id = r.organization_id
   AND sc.sku = r.sku;

CREATE INDEX IF NOT EXISTS idx_replenishment_requests_org_catalog
  ON replenishment_requests (organization_id, sku_catalog_id)
  WHERE sku_catalog_id IS NOT NULL;

-- ── 4. Earmarks name the internal order ────────────────────────────────────
ALTER TABLE shortage_inbound_links
  ADD COLUMN IF NOT EXISTS inbound_order_id BIGINT REFERENCES inbound_order(id) ON DELETE SET NULL;

UPDATE shortage_inbound_links sil
   SET inbound_order_id = io.id
  FROM inbound_order io
 WHERE sil.inbound_order_id IS NULL
   AND NULLIF(btrim(sil.zoho_po_id), '') IS NOT NULL
   AND io.organization_id = sil.organization_id
   AND io.source_type = 'zoho'
   AND io.external_order_id_norm = inbound_order_number_norm(sil.zoho_po_id);

UPDATE shortage_inbound_links sil
   SET inbound_order_id = rl.inbound_order_id
  FROM receiving_line rl
 WHERE sil.inbound_order_id IS NULL
   AND sil.receiving_line_id IS NOT NULL
   AND rl.id = sil.receiving_line_id
   AND rl.organization_id = sil.organization_id
   AND rl.inbound_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shortage_inbound_links_org_order
  ON shortage_inbound_links (organization_id, inbound_order_id)
  WHERE inbound_order_id IS NOT NULL;
