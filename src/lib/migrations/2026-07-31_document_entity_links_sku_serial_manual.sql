-- 2026-07-31_document_entity_links_sku_serial_manual.sql
-- JIT pack documents Phase 3 — grow document_entity_links to SKU + SERIAL_UNIT
-- so product manuals can live on `documents` (document_type='manual') with a
-- polymorphic SKU primary link (sku_catalog.id). SERIAL_UNIT reserved for
-- unit-specific inserts later.
--
-- Also:
--   - parent-delete triggers for the new entity types (link cascade)
--   - backfill: promote assigned product_manuals that have a source_url +
--     sku_catalog_id into documents + SKU links (idempotent via
--     document_data->>'productManualId')
--
-- product_manuals remains the library write SoT this phase; documents is the
-- pack/print + Testing dual-read projection. Full write cutover is Phase 3b.
--
-- ROLLBACK: delete backfilled manual documents; drop new triggers; restore
--           chk_document_entity_links_entity_type to ORDER|SHIPMENT.

BEGIN;

ALTER TABLE document_entity_links
  DROP CONSTRAINT IF EXISTS chk_document_entity_links_entity_type;

ALTER TABLE document_entity_links
  ADD CONSTRAINT chk_document_entity_links_entity_type
  CHECK (entity_type IN ('ORDER', 'SHIPMENT', 'SKU', 'SERIAL_UNIT'));

CREATE OR REPLACE FUNCTION fn_delete_document_entity_links_on_parent_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM document_entity_links
  WHERE entity_type = TG_ARGV[0]
    AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_doc_links_on_order_delete ON orders;
CREATE TRIGGER trg_delete_doc_links_on_order_delete
AFTER DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION fn_delete_document_entity_links_on_parent_delete('ORDER');

DROP TRIGGER IF EXISTS trg_delete_doc_links_on_stn_delete ON shipping_tracking_numbers;
CREATE TRIGGER trg_delete_doc_links_on_stn_delete
AFTER DELETE ON shipping_tracking_numbers
FOR EACH ROW EXECUTE FUNCTION fn_delete_document_entity_links_on_parent_delete('SHIPMENT');

DROP TRIGGER IF EXISTS trg_delete_doc_links_on_sku_catalog_delete ON sku_catalog;
CREATE TRIGGER trg_delete_doc_links_on_sku_catalog_delete
AFTER DELETE ON sku_catalog
FOR EACH ROW EXECUTE FUNCTION fn_delete_document_entity_links_on_parent_delete('SKU');

DROP TRIGGER IF EXISTS trg_delete_doc_links_on_serial_unit_delete ON serial_units;
CREATE TRIGGER trg_delete_doc_links_on_serial_unit_delete
AFTER DELETE ON serial_units
FOR EACH ROW EXECUTE FUNCTION fn_delete_document_entity_links_on_parent_delete('SERIAL_UNIT');

-- Phase 3: manuals may ledger against documents.id (product_manual_id still OK for bridge).
ALTER TABLE document_print_jobs
  DROP CONSTRAINT IF EXISTS document_print_jobs_source_chk;

ALTER TABLE document_print_jobs
  ADD CONSTRAINT document_print_jobs_source_chk
  CHECK (
    (document_type IN ('shipping_label', 'packing_slip') AND document_id IS NOT NULL)
    OR (
      document_type = 'manual'
      AND (product_manual_id IS NOT NULL OR document_id IS NOT NULL)
    )
  );

-- documents.entity_type/entity_id are legacy spine columns; manuals own via
-- document_entity_links. Use entity_type='ORDER' + entity_id=0 as a inert
-- placeholder (no real order) so NOT NULL constraints stay satisfied.
INSERT INTO documents (
  organization_id, entity_type, entity_id, document_type, document_data, created_at, updated_at
)
SELECT
  sc.organization_id,
  'ORDER',
  0,
  'manual',
  jsonb_build_object(
    'url', pm.source_url,
    'source', 'product_manuals_promote',
    'platform', 'manual',
    'mimeType', 'application/pdf',
    'filename', COALESCE(NULLIF(BTRIM(pm.file_name), ''), NULLIF(BTRIM(pm.display_name), ''), 'manual.pdf'),
    'displayName', COALESCE(NULLIF(BTRIM(pm.display_name), ''), NULLIF(BTRIM(pm.file_name), ''), 'Manual'),
    'productManualId', pm.id,
    'manualType', pm.type
  ),
  COALESCE(pm.created_at, NOW()),
  COALESCE(pm.updated_at, NOW())
FROM product_manuals pm
JOIN sku_catalog sc ON sc.id = pm.sku_catalog_id
WHERE pm.is_active = TRUE
  AND pm.status = 'assigned'
  AND pm.sku_catalog_id IS NOT NULL
  AND pm.source_url IS NOT NULL
  AND BTRIM(pm.source_url) <> ''
  AND sc.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM documents d
     WHERE d.organization_id = sc.organization_id
       AND d.document_type = 'manual'
       AND (d.document_data->>'productManualId') = pm.id::text
  );

INSERT INTO document_entity_links (document_id, organization_id, entity_type, entity_id, link_role)
SELECT d.id, d.organization_id, 'SKU', pm.sku_catalog_id, 'primary'
FROM documents d
JOIN product_manuals pm ON pm.id = (d.document_data->>'productManualId')::int
WHERE d.document_type = 'manual'
  AND d.document_data->>'source' = 'product_manuals_promote'
  AND pm.sku_catalog_id IS NOT NULL
ON CONFLICT ON CONSTRAINT ux_document_entity_links_unique DO NOTHING;

COMMENT ON CONSTRAINT chk_document_entity_links_entity_type ON document_entity_links IS
  'ORDER|SHIPMENT outbound; SKU|SERIAL_UNIT for manuals/inserts (JIT Phase 3).';

COMMIT;
