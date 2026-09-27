-- 2026-09-26_identify_probe_indexes.sql
--
-- WHAT
--   Org-led plain btree indexes for the exact arms of POST /api/identify
--   (src/lib/identify/sql.ts) that have no usable index today:
--     idx_orders_org_item_number              orders (organization_id, item_number)
--     idx_receiving_carton_org_po_number      receiving_carton (organization_id, zoho_purchaseorder_number)
--     idx_tsn_org_serial_number               tech_serial_numbers (organization_id, serial_number)
--     idx_sku_catalog_org_upc                 sku_catalog (organization_id, upc)
--     idx_sku_catalog_org_ean                 sku_catalog (organization_id, ean)
--     idx_items_org_upc                       items (organization_id, upc)
--     idx_items_org_ean                       items (organization_id, ean)
--     idx_fba_fnskus_org_asin                 fba_fnskus (organization_id, asin)
--
-- WHY
--   Identify answers every exact probe of a paste in ONE statement of
--   `organization_id = $1 AND <col> = ANY($n::text[])` arms. Under FORCE RLS
--   as app_tenant only leakproof operators can be index conditions
--   (phase0-findings §Schema 0): uuid_eq and texteq are, so an index keyed on
--   exactly (organization_id, <text col>) serves each arm as an index probe.
--   The columns above had either no index (item_number, zoho_purchaseorder_number,
--   serial_number, ean, asin-by-org) or one not led by organization_id
--   (items_upc_idx, idx_sku_catalog_upc, idx_fba_fnskus_asin), which under RLS
--   degrades to the org index + filter. tech_serial_numbers.serial_number is
--   stored upper(btrim()) (0 of 4,117 rows differ, 2026-09-26), so identify and
--   /api/scan/resolve compare the plain column — no expression index needed.
--   Tables are small today (orders 5.2k, receiving_carton 4.2k, tsn 4.1k,
--   sku_catalog 1.7k, items 2.1k, fba_fnskus 245): each arm is ~1 ms either
--   way; these keep it an index probe as the tenants grow.
--
-- SAFETY
--   Plain CREATE INDEX IF NOT EXISTS (the runner wraps the file in a
--   transaction). Small tables: sub-second SHARE locks (writes wait, reads
--   continue). No code depends on the indexes existing; queries are correct
--   without them.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS <each name above>;
--
-- VERIFY (as app_tenant, BEGIN READ ONLY; set_config('app.current_org', …, true))
--   EXPLAIN SELECT id FROM orders WHERE organization_id = '<org>' AND item_number = ANY('{00862}'::text[]);
--   → Index Cond: ((organization_id = …) AND (item_number = ANY (…)))

CREATE INDEX IF NOT EXISTS idx_orders_org_item_number
  ON orders (organization_id, item_number)
  WHERE item_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receiving_carton_org_po_number
  ON receiving_carton (organization_id, zoho_purchaseorder_number)
  WHERE zoho_purchaseorder_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tsn_org_serial_number
  ON tech_serial_numbers (organization_id, serial_number);

CREATE INDEX IF NOT EXISTS idx_sku_catalog_org_upc
  ON sku_catalog (organization_id, upc)
  WHERE upc IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sku_catalog_org_ean
  ON sku_catalog (organization_id, ean)
  WHERE ean IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_org_upc
  ON items (organization_id, upc)
  WHERE upc IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_org_ean
  ON items (organization_id, ean)
  WHERE ean IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fba_fnskus_org_asin
  ON fba_fnskus (organization_id, asin)
  WHERE asin IS NOT NULL;
