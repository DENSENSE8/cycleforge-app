-- ============================================================================
-- 2026-09-27i: replenishment is internal-first — no Zoho item required
-- ============================================================================
-- A replenishment request is demand for a CATALOG item (sku_catalog_id) that
-- becomes an internal inbound order (inbound_order_id). Zoho is an optional
-- export, never a prerequisite:
--   - item_id / zoho_item_id stop being NOT NULL (a SKU with no Zoho item can
--     be replenished); a request must still name its item — catalog or Zoho;
--   - stock_available / stock_on_hand / stock_incoming hold CycleForge's own
--     inventory position (src/lib/inventory/inventory-position.ts). The
--     zoho_quantity_* columns are left in place, read by nothing new, for the
--     dual-key window;
--   - replenishment_requests_zoho_po_id_key was UNIQUE (zoho_po_id): one Zoho
--     PO carrying two requests (every vendor bucket of >1 item) violated it.
--     The plain rr_zoho_po_id_idx already serves lookups.
--
-- ROLLBACK:
--   ALTER TABLE replenishment_requests DROP CONSTRAINT IF EXISTS replenishment_requests_item_identity_chk;
--   ALTER TABLE replenishment_requests DROP COLUMN IF EXISTS stock_available,
--     DROP COLUMN IF EXISTS stock_on_hand, DROP COLUMN IF EXISTS stock_incoming;
--   (NOT NULL / the zoho_po_id unique can only return once no row violates them.)
-- ============================================================================

ALTER TABLE replenishment_requests ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE replenishment_requests ALTER COLUMN zoho_item_id DROP NOT NULL;

ALTER TABLE replenishment_requests
  ADD COLUMN IF NOT EXISTS stock_available NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS stock_on_hand NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS stock_incoming NUMERIC(12, 2);

UPDATE replenishment_requests
   SET stock_available = COALESCE(stock_available, zoho_quantity_available),
       stock_on_hand = COALESCE(stock_on_hand, zoho_quantity_on_hand),
       stock_incoming = COALESCE(stock_incoming, zoho_incoming_quantity);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'replenishment_requests_item_identity_chk') THEN
    ALTER TABLE replenishment_requests
      ADD CONSTRAINT replenishment_requests_item_identity_chk
      CHECK (sku_catalog_id IS NOT NULL OR NULLIF(btrim(zoho_item_id), '') IS NOT NULL);
  END IF;
END $$;

ALTER TABLE replenishment_requests DROP CONSTRAINT IF EXISTS replenishment_requests_zoho_po_id_key;
DROP INDEX IF EXISTS replenishment_requests_zoho_po_id_key;

CREATE INDEX IF NOT EXISTS idx_replenishment_requests_org_inbound_order
  ON replenishment_requests (organization_id, inbound_order_id)
  WHERE inbound_order_id IS NOT NULL;
