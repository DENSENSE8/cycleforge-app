-- ============================================================================
-- 2026-09-11b: search-doc enrichment sources — enqueue triggers + re-enqueue
-- ============================================================================
-- Phase C of docs/todo/search-10x-index-and-notes-PLAN.md. The builders
-- (src/lib/search/build-search-text.ts) and the worker loader SQL
-- (src/lib/search/search-outbox-worker.ts LOADER_SQL) now fold three sources
-- into the canonical text that were previously invisible to search:
--
--   SKU         ← sku_platform_ids (platform_sku, platform_item_id = ASIN /
--                 eBay item id, account_name) and sku_kit_parts
--                 (component_name, document_title). Staff hold an ASIN or a
--                 BOM part name far more often than the internal SKU.
--   ORDER       ← the order_notes TABLE (note_text). Only the single
--                 orders.notes COLUMN was indexed, so every note written
--                 through the notes trail was unsearchable.
--   SERIAL_UNIT ← handling_units.code via serial_units.handling_unit_id — the
--                 H- tote label a picker is physically holding.
--
-- Without triggers on those sources the new text is only as fresh as the next
-- write to the PARENT row: attach a listing, add a note, or move a unit into a
-- tote and the doc stays stale forever (the same defect 2026-07-04a fixed for
-- receiving_lines / fba_shipment_items). This migration closes all four gaps
-- and re-enqueues the affected docs so the new text lands on the next drain.
--
-- SHAPE — copied from 2026-07-04a_search_outbox_claim_window.sql:
--   • A join table's grain is not the parent's, so fn_enqueue_entity_search_
--     outbox() (which reads NEW.id) cannot be reused; each source gets a small
--     function that resolves the PARENT id and the org.
--   • Org resolution: order_notes carries organization_id itself
--     (2026-07-28_order_notes.sql:50). The sku_catalog children carry one too
--     (2026-05-23_org_id_on_business_tables.sql:51) but the doc must be filed
--     under the PARENT's tenant, so org is read from sku_catalog — a single PK
--     lookup, same as the fba_shipment_items precedent. A child that resolves
--     to no org (unpaired platform listing, sku_catalog_id NULL since
--     2026-04-09_ecwid_platform_pairing.sql:13) enqueues nothing.
--   • ON CONFLICT targets the pending partial unique EXACTLY as re-cut in
--     2026-07-04a: (organization_id, entity_type, entity_id)
--     WHERE processed_at IS NULL AND claimed_at IS NULL.
--   • UPDATE triggers are DOUBLE-guarded (UPDATE OF <cols> + WHEN IS DISTINCT
--     FROM) — the sync writers blanket-SET unchanged COALESCE values on every
--     poll, and UPDATE OF alone would re-embed every synced row every interval.
--   • No new entity_type: SKU / ORDER / SERIAL_UNIT are all already in the
--     NAMED CHECK on both tables, so neither constraint is touched.
--
-- UPDATE OF / builder sync (the 2026-07-03d:36-37 law): the SKU and ORDER
-- header column lists are unchanged — no sku_catalog or orders COLUMN entered
-- the builders, only join tables. serial_units DID gain one (handling_unit_id
-- feeds the tote code), so its UPDATE trigger is recreated with that column in
-- both the UPDATE OF list and the WHEN guard.
--
-- Renaming a tote (handling_units.code, e.g. a scanned external barcode
-- replacing H-{id}) stales every member unit's doc, so that gets a set-based
-- fan-out re-enqueue — bounded by the units in one box.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE,
-- and an ON CONFLICT DO NOTHING backfill.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_platform_ids_ins ON sku_platform_ids;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_platform_ids_upd ON sku_platform_ids;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_kit_parts_ins ON sku_kit_parts;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_kit_parts_upd ON sku_kit_parts;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_order_notes_ins ON order_notes;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_order_notes_upd ON order_notes;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_handling_units_upd ON handling_units;
--   DROP FUNCTION IF EXISTS fn_enqueue_search_outbox_sku_child();
--   DROP FUNCTION IF EXISTS fn_enqueue_search_outbox_order_note();
--   DROP FUNCTION IF EXISTS fn_enqueue_search_outbox_handling_unit();
--   -- restore the pre-enrichment serial_units UPDATE trigger:
--   re-run the trg_enqueue_search_outbox_on_serial_units_upd block of
--   2026-07-03d_entity_search_docs.sql (its column list omits handling_unit_id).
--   (Enqueued rows are harmless; the worker just rebuilds the docs.)
--
-- VERIFY (after apply):
--   -- a note enqueues its ORDER
--   INSERT INTO order_notes (organization_id, order_id, note_text)
--   SELECT organization_id, id, 'search freshness probe' FROM orders LIMIT 1;
--   SELECT entity_type, entity_id FROM entity_search_outbox
--    WHERE processed_at IS NULL AND entity_type = 'ORDER' ORDER BY id DESC LIMIT 5;
--   -- the backfill queued the enrichment sweep
--   SELECT entity_type, COUNT(*) FROM entity_search_outbox
--    WHERE processed_at IS NULL GROUP BY 1;
--   -- after a drain, the new sources are in the text
--   SELECT entity_id, LEFT(search_text, 200) FROM entity_search_docs
--    WHERE entity_type = 'SKU' AND search_text ILIKE '%B0%' LIMIT 5;
-- ============================================================================

BEGIN;

-- ── 1. sku_platform_ids / sku_kit_parts → re-enqueue the parent SKU doc ─────
-- One function for both children: TG_ARGV is unnecessary because the parent
-- entity type is SKU either way; the only per-table difference is which
-- columns the UPDATE trigger watches.
CREATE OR REPLACE FUNCTION fn_enqueue_search_outbox_sku_child()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cid BIGINT;
  parent_org UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    cid := OLD.sku_catalog_id;
  ELSE
    cid := NEW.sku_catalog_id;
  END IF;
  IF cid IS NULL THEN
    RETURN NULL;  -- unpaired platform listing: no SKU doc to refresh
  END IF;
  SELECT organization_id INTO parent_org FROM sku_catalog WHERE id = cid;
  IF parent_org IS NULL THEN
    RETURN NULL;  -- AFTER trigger: return value is ignored
  END IF;
  INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
  VALUES (parent_org, 'SKU', cid)
  ON CONFLICT (organization_id, entity_type, entity_id)
  WHERE processed_at IS NULL AND claimed_at IS NULL
  DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_platform_ids_ins ON sku_platform_ids;
CREATE TRIGGER trg_enqueue_search_outbox_on_sku_platform_ids_ins
  AFTER INSERT OR DELETE ON sku_platform_ids
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_search_outbox_sku_child();

-- Watches exactly what LOADER_SQL.SKU aggregates (platform_sku,
-- platform_item_id, account_name) plus the re-pair column. listing_title /
-- listing_status / confidence are NOT in the doc, so they must not re-embed.
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_platform_ids_upd ON sku_platform_ids;
CREATE TRIGGER trg_enqueue_search_outbox_on_sku_platform_ids_upd
  AFTER UPDATE OF platform_sku, platform_item_id, account_name, sku_catalog_id
  ON sku_platform_ids
  FOR EACH ROW
  WHEN (OLD.platform_sku     IS DISTINCT FROM NEW.platform_sku
     OR OLD.platform_item_id IS DISTINCT FROM NEW.platform_item_id
     OR OLD.account_name     IS DISTINCT FROM NEW.account_name
     OR OLD.sku_catalog_id   IS DISTINCT FROM NEW.sku_catalog_id)
  EXECUTE FUNCTION fn_enqueue_search_outbox_sku_child();

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_kit_parts_ins ON sku_kit_parts;
CREATE TRIGGER trg_enqueue_search_outbox_on_sku_kit_parts_ins
  AFTER INSERT OR DELETE ON sku_kit_parts
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_search_outbox_sku_child();

-- component_name + document_title are the two BOM fields the doc indexes;
-- qty_required / sort_order / document_url churn without changing the text.
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_kit_parts_upd ON sku_kit_parts;
CREATE TRIGGER trg_enqueue_search_outbox_on_sku_kit_parts_upd
  AFTER UPDATE OF component_name, document_title, sku_catalog_id
  ON sku_kit_parts
  FOR EACH ROW
  WHEN (OLD.component_name IS DISTINCT FROM NEW.component_name
     OR OLD.document_title IS DISTINCT FROM NEW.document_title
     OR OLD.sku_catalog_id IS DISTINCT FROM NEW.sku_catalog_id)
  EXECUTE FUNCTION fn_enqueue_search_outbox_sku_child();

-- ── 2. order_notes → re-enqueue the parent ORDER doc ────────────────────────
-- order_notes carries organization_id itself (loud-fail GUC default), so the
-- org comes off the row — no parent lookup needed.
CREATE OR REPLACE FUNCTION fn_enqueue_search_outbox_order_note()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  oid BIGINT;
  org UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    oid := OLD.order_id; org := OLD.organization_id;
  ELSE
    oid := NEW.order_id; org := NEW.organization_id;
  END IF;
  IF oid IS NULL OR org IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
  VALUES (org, 'ORDER', oid)
  ON CONFLICT (organization_id, entity_type, entity_id)
  WHERE processed_at IS NULL AND claimed_at IS NULL
  DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_order_notes_ins ON order_notes;
CREATE TRIGGER trg_enqueue_search_outbox_on_order_notes_ins
  AFTER INSERT OR DELETE ON order_notes
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_search_outbox_order_note();

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_order_notes_upd ON order_notes;
CREATE TRIGGER trg_enqueue_search_outbox_on_order_notes_upd
  AFTER UPDATE OF note_text, order_id ON order_notes
  FOR EACH ROW
  WHEN (OLD.note_text IS DISTINCT FROM NEW.note_text
     OR OLD.order_id  IS DISTINCT FROM NEW.order_id)
  EXECUTE FUNCTION fn_enqueue_search_outbox_order_note();

-- ── 3. serial_units: handling_unit_id joins the watched column list ─────────
-- Recreated from 2026-07-03d_entity_search_docs.sql:204-219 with
-- handling_unit_id added — the builder now reads handling_units.code through
-- it, so moving a unit between totes must refresh the doc.
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_serial_units_upd ON serial_units;
CREATE TRIGGER trg_enqueue_search_outbox_on_serial_units_upd
  AFTER UPDATE OF serial_number, normalized_serial, sku, unit_uid,
    current_status, condition_grade, current_location, notes, sku_catalog_id,
    received_at, handling_unit_id
  ON serial_units
  FOR EACH ROW
  WHEN (OLD.serial_number    IS DISTINCT FROM NEW.serial_number
     OR OLD.normalized_serial IS DISTINCT FROM NEW.normalized_serial
     OR OLD.sku              IS DISTINCT FROM NEW.sku
     OR OLD.unit_uid         IS DISTINCT FROM NEW.unit_uid
     OR OLD.current_status   IS DISTINCT FROM NEW.current_status
     OR OLD.condition_grade  IS DISTINCT FROM NEW.condition_grade
     OR OLD.current_location IS DISTINCT FROM NEW.current_location
     OR OLD.notes            IS DISTINCT FROM NEW.notes
     OR OLD.sku_catalog_id   IS DISTINCT FROM NEW.sku_catalog_id
     OR OLD.received_at      IS DISTINCT FROM NEW.received_at
     OR OLD.handling_unit_id IS DISTINCT FROM NEW.handling_unit_id)
  EXECUTE FUNCTION fn_enqueue_entity_search_outbox('SERIAL_UNIT');

-- ── 4. handling_units.code rename → re-enqueue every member unit ────────────
-- Only `code` is indexed (status/notes of the box are not in the unit doc).
-- Set-based fan-out, bounded by the units currently in the box.
CREATE OR REPLACE FUNCTION fn_enqueue_search_outbox_handling_unit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
  SELECT su.organization_id, 'SERIAL_UNIT', su.id
  FROM serial_units su
  WHERE su.handling_unit_id = NEW.id
    AND su.organization_id IS NOT NULL
  ON CONFLICT (organization_id, entity_type, entity_id)
  WHERE processed_at IS NULL AND claimed_at IS NULL
  DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_handling_units_upd ON handling_units;
CREATE TRIGGER trg_enqueue_search_outbox_on_handling_units_upd
  AFTER UPDATE OF code ON handling_units
  FOR EACH ROW
  WHEN (OLD.code IS DISTINCT FROM NEW.code)
  EXECUTE FUNCTION fn_enqueue_search_outbox_handling_unit();

-- ── 5. Re-enqueue the docs whose composition changed ────────────────────────
-- ALWAYS through the outbox — never a direct write to entity_search_docs — so
-- the worker rebuilds title/subtitle/facets/embedding through the one builder.
-- Scoped to the three affected types; RECEIVING / REPAIR / FBA_SHIPMENT text
-- is unchanged by this wave and must not be re-embedded.
INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
SELECT d.organization_id, d.entity_type, d.entity_id
FROM entity_search_docs d
WHERE d.entity_type IN ('SKU', 'ORDER', 'SERIAL_UNIT')
ON CONFLICT (organization_id, entity_type, entity_id)
WHERE processed_at IS NULL AND claimed_at IS NULL
DO NOTHING;

COMMIT;
