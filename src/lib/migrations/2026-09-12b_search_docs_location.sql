-- ============================================================================
-- 2026-09-12b: LOCATION joins entity_search_docs; Zoho items fold into SKU
-- ============================================================================
-- Phase D remainder of docs/todo/search-10x-index-and-notes-PLAN.md. Two
-- families of identifiers staff say out loud were not findable:
--
--   LOCATION — `locations` is the bin/room spine (2026-04-09_create_locations
--     .sql, org-scoped and tenant-isolated at 2026-06-22e:35). Every bin label
--     in the building carries a barcode, staff name bins constantly ("it's in
--     A-12-03"), and typing that barcode or a room name resolved NOTHING: the
--     only bin surfaces were the barcode-keyed detail fetch
--     (`/api/locations/[barcode]`) and the `/l/[ref]` scan landing. This adds
--     the ninth discriminator so a bin is a RECORD the index returns.
--
--   Zoho items — NO new entity type. `items.id` is a uuid while
--     entity_search_docs.entity_id is BIGINT BY LAW ("so no future widening",
--     2026-07-03d:12-13). Minting an ITEM type would mean widening entity_id
--     for all nine existing types and re-cutting the natural unique index, or
--     bolting a surrogate integer key onto the provider mirror. Neither is
--     authorised, and neither is necessary: an `items` row is the inventory
--     PROVIDER's copy of a catalog row, so its identifiers (Zoho item number,
--     item name, UPC, EAN, provider SKU) fold into the EXISTING SKU doc over
--     the one legal join, `sku_catalog.provider_item_id = items.zoho_item_id`
--     (2026-07-22_sku_catalog_provider_item_id.sql:23-27). The doc stays keyed
--     to `sku_catalog.id`, which is an integer. NEVER joined on the SKU
--     string: `items.sku` and `sku_catalog.sku` are independent numbering
--     schemes that collide on the same values (2026-07-22:5-9), so a string
--     join would hang one product's provider identifiers off another's row.
--     The SQL half of that is one column on the sku_catalog UPDATE trigger;
--     the join itself lives in LOADER_SQL.SKU.
--
-- The new discriminator follows 2026-07-03d EXACTLY (entity_type TEXT + NAMED
-- CHECK on BOTH tables, generic TG_ARGV[0] enqueue/delete dispatch,
-- double-guarded UPDATE trigger, the pending partial unique as re-cut by
-- 2026-07-04a). No column is added to entity_search_docs: LOCATION fills only
-- typed facet columns that already exist (status, happened_at).
--
-- ─── TRIGGER INVENTORY (table → event → enqueued entity_type) ───────────────
--   locations      INSERT                                       → LOCATION
--                  UPDATE OF (barcode, name, display_name, room,
--                    row_label, col_label, zone_letter, bin_type,
--                    bin_role, location_kind, description,
--                    is_active, locked_for_count)               → LOCATION
--                  DELETE                            → drop doc + pending row
--   sku_catalog    UPDATE OF (… + provider_item_id)             → SKU
--                  (INSERT / DELETE triggers unchanged from 2026-07-03d:
--                   252-257 and its parent-delete arm — only the UPDATE
--                   column list is re-cut here.)
--
-- ─── UPDATE OF / builder mirror law (2026-07-03d:36-37) ────────────────────
-- Each watched list mirrors what the loader SELECTs and the builder reads
-- (src/lib/search/search-outbox-worker.ts LOADER_SQL.LOCATION / .SKU,
-- build-search-text.ts buildLocationDoc / buildSkuDoc). Named deviations,
-- each deliberate:
--
--   1. locations.is_active and locked_for_count ARE watched although they are
--      booleans, not text: buildLocationDoc emits them as the WORDS
--      `INACTIVE` / `LOCKED FOR COUNT`, so they are indexed content and a
--      deactivation must refresh the doc. Note the loader has NO is_active
--      predicate — a retired bin stays searchable off its printed label and
--      reads back as INACTIVE, rather than silently vanishing (this is the
--      OPPOSITE call from warranty_claims.deleted_at, and deliberately so: a
--      tombstoned claim is a record that should not exist, a deactivated bin
--      is a shelf that is still physically there with a label on it).
--   2. locations.capacity / sort_order / parent_id / warehouse_id are NOT
--      watched — no builder reads them. capacity is a number an operator does
--      not search by; the hierarchy columns are cross-links, not text.
--   3. NEITHER table's updated_at is watched, although both builders read it
--      for the happened_at facet. Exact precedent: buildSkuDoc has always read
--      sku_catalog.updated_at while its UPDATE trigger omits it
--      (2026-07-03d:260-261). updated_at moves on EVERY write, so watching it
--      would defeat the double-guard and re-embed on churn that changed no
--      indexed text.
--   4. sku_catalog.provider_item_id is watched: it is the JOIN KEY for the
--      items identifiers, so re-pointing (or first linking) a catalog row at a
--      provider item must refresh the doc. Same role customer_id plays on the
--      warranty trigger (2026-09-12a:49-51).
--
-- ─── NAMED GAPS (not closed here, not silently skipped) ────────────────────
--   a. `bin_contents` is NOT triggered. The LOCATION doc carries the SKUs
--      stored in the bin through a LEFT-bounded LATERAL, so a putaway or a
--      pick does not refresh the bin's doc until the bin row itself is
--      written. Closing it needs a bespoke resolver function, not the generic
--      one: bin_contents' parent key is `location_id`, while
--      fn_enqueue_entity_search_outbox() reads NEW.id. It is also the churniest
--      table in the building — every pick and putaway writes it — so the
--      double-guard would not help and every doc would re-embed on movement.
--      This is the same posture 2026-07-03d:39-43 took for the order/serial
--      join tables. (Note: bin_contents has 0 rows in this lane, so the
--      contents path cannot be demonstrated on this data — it is correct by
--      construction, not by observation.)
--   b. `items` is NOT triggered. A SKU doc carries the provider item's name /
--      SKU / UPC / EAN through the LEFT JOIN, so renaming a Zoho item does not
--      refresh the SKU doc until the catalog row is written. Same shape as the
--      `customers` gap the ORDER and WARRANTY_CLAIM docs already carry
--      (2026-09-12a:59-66), and here it is also protective: the Zoho poller
--      rewrites `items` on every sweep, and a trigger there would need a
--      bespoke resolver (items.id is a uuid; the doc key is sku_catalog.id
--      reached through provider_item_id) AND would re-embed the catalog on
--      provider churn. A re-enqueue sweep is the intended refresh path.
--   c. `locations.zone` (the legacy 2026-04-09 grouping column, superseded by
--      room / zone_letter) is deliberately absent from both the loader and the
--      trigger — indexing a dead column would make stale text searchable.
--
-- ─── ORG RESOLUTION ────────────────────────────────────────────────────────
-- `locations.organization_id` is NOT NULL and the table is FORCE-RLS'd with
-- the app.current_org GUC default (2026-06-22e_enforce_tenant_isolation_core_
-- usav_fallback.sql:35), so the generic fn_enqueue_entity_search_outbox()
-- (which reads NEW.organization_id and NEW.id) is reused unchanged — no
-- per-table resolver. A successful parent write implies the GUC, the same
-- posture as 2026-07-03d:20-24.
--
-- Every enqueue targets the LIVE pending partial unique
--   ux_entity_search_outbox_pending (organization_id, entity_type, entity_id)
--   WHERE processed_at IS NULL AND claimed_at IS NULL   (2026-07-04a:50-52)
-- so a parent write during a drain lands a FRESH pending row.
--
-- Idempotent / re-runnable: guarded DROP+ADD CONSTRAINT, DROP TRIGGER IF
-- EXISTS + CREATE TRIGGER, and INSERT … ON CONFLICT DO NOTHING backfills.
-- Nothing writes entity_search_docs directly — the worker owns doc content.
--
-- DEPLOY ORDER: the code that knows LOCATION (build-search-text.ts BUILDERS +
-- LOADER_SQL) must ship WITH or BEFORE this migration. A worker that predates
-- it dead-letters the rows via markFailed ("unsupported entity_type") rather
-- than looping — recoverable, but the docs stay missing until a re-enqueue.
-- The SKU widening is backward-safe in the other direction too: a worker that
-- already selects items columns against a pre-2026-07-22 database is
-- impossible (provider_item_id has existed since July), and the new SKU
-- re-enqueue below is what actually pulls the item identifiers into existing
-- docs.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_locations_ins ON locations;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_locations_upd ON locations;
--   DROP TRIGGER IF EXISTS trg_delete_search_docs_on_locations_delete ON locations;
--   DELETE FROM entity_search_outbox WHERE entity_type = 'LOCATION';
--   DELETE FROM entity_search_docs   WHERE entity_type = 'LOCATION';
--   -- then narrow both CHECKs back to the eight 2026-09-12a values (the two
--   -- DELETEs above must run FIRST or the constraint will not validate):
--   ALTER TABLE entity_search_docs   DROP CONSTRAINT IF EXISTS entity_search_docs_entity_type_chk;
--   ALTER TABLE entity_search_docs   ADD  CONSTRAINT entity_search_docs_entity_type_chk
--     CHECK (entity_type IN ('ORDER','SERIAL_UNIT','RECEIVING','SKU','REPAIR',
--                            'FBA_SHIPMENT','WARRANTY_CLAIM','SUPPORT_TICKET'));
--   ALTER TABLE entity_search_outbox DROP CONSTRAINT IF EXISTS entity_search_outbox_entity_type_chk;
--   ALTER TABLE entity_search_outbox ADD  CONSTRAINT entity_search_outbox_entity_type_chk
--     CHECK (entity_type IN ('ORDER','SERIAL_UNIT','RECEIVING','SKU','REPAIR',
--                            'FBA_SHIPMENT','WARRANTY_CLAIM','SUPPORT_TICKET'));
--   -- and restore the sku_catalog UPDATE trigger WITHOUT provider_item_id:
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_catalog_upd ON sku_catalog;
--   CREATE TRIGGER trg_enqueue_search_outbox_on_sku_catalog_upd
--     AFTER UPDATE OF sku, product_title, category, upc, ean, gtin, notes,
--       lifecycle_status, is_active
--     ON sku_catalog FOR EACH ROW
--     WHEN (OLD.sku IS DISTINCT FROM NEW.sku
--        OR OLD.product_title IS DISTINCT FROM NEW.product_title
--        OR OLD.category IS DISTINCT FROM NEW.category
--        OR OLD.upc IS DISTINCT FROM NEW.upc
--        OR OLD.ean IS DISTINCT FROM NEW.ean
--        OR OLD.gtin IS DISTINCT FROM NEW.gtin
--        OR OLD.notes IS DISTINCT FROM NEW.notes
--        OR OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status
--        OR OLD.is_active IS DISTINCT FROM NEW.is_active)
--     EXECUTE FUNCTION fn_enqueue_entity_search_outbox('SKU');
--
-- VERIFY (after apply; <org> is a real org, <loc>/<sku> real ids in it):
--   -- 1. both CHECKs carry LOCATION
--   SELECT conrelid::regclass AS tbl, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname IN ('entity_search_docs_entity_type_chk',
--                      'entity_search_outbox_entity_type_chk');
--   -- 2. the trigger inventory is actually on the tables
--   SELECT tgname, tgrelid::regclass FROM pg_trigger
--    WHERE NOT tgisinternal
--      AND tgrelid IN ('locations'::regclass, 'sku_catalog'::regclass)
--    ORDER BY 2, 1;
--   -- 3. the backfill queued both families
--   SELECT entity_type, COUNT(*) FROM entity_search_outbox
--    WHERE processed_at IS NULL GROUP BY 1;
--   -- 4. a real edit enqueues; a blanket no-op SET does NOT
--   SET LOCAL app.current_org = '<org>';
--   UPDATE locations SET room = COALESCE(room,'') || 'x' WHERE id = <loc>;
--   SELECT COUNT(*) FROM entity_search_outbox
--    WHERE processed_at IS NULL AND entity_type = 'LOCATION';    -- +1
--   UPDATE locations SET barcode = barcode WHERE id = <loc>;
--   SELECT COUNT(*) FROM entity_search_outbox
--    WHERE processed_at IS NULL AND entity_type = 'LOCATION';    -- unchanged
--   UPDATE locations SET capacity = COALESCE(capacity,0) + 1 WHERE id = <loc>;
--   SELECT COUNT(*) FROM entity_search_outbox
--    WHERE processed_at IS NULL AND entity_type = 'LOCATION';    -- unchanged
--                                            (capacity is not watched at all)
--   -- 5. linking a catalog row to a provider item refreshes the SKU doc
--   UPDATE sku_catalog SET provider_item_id = provider_item_id || '' WHERE id = <sku>;
--   -- (no-op → unchanged; set it to a DIFFERENT value → +1 pending SKU row)
--   -- 6. after a drain, a bin barcode and a Zoho item number are findable
--   SELECT entity_id, title, LEFT(search_text, 120) FROM entity_search_docs
--    WHERE entity_type = 'LOCATION' LIMIT 5;
--   SELECT d.entity_id, d.title, LEFT(d.search_text, 160)
--     FROM entity_search_docs d
--     JOIN sku_catalog sc ON sc.id = d.entity_id AND sc.organization_id = d.organization_id
--    WHERE d.entity_type = 'SKU' AND sc.provider_item_id IS NOT NULL
--      AND d.search_text ILIKE '%' || sc.provider_item_id || '%'
--    LIMIT 5;
-- ============================================================================

BEGIN;

-- ── 1. entity_type CHECK: BOTH tables, or the trigger fails at runtime ──────
-- The docs CHECK guards the worker's upsert; the OUTBOX CHECK guards the
-- trigger's INSERT. Widening only one would let the enqueue succeed and the
-- drain explode (or the reverse) — they are recreated together, here. All
-- eight live values are preserved and LOCATION appended.
DO $$ BEGIN
  ALTER TABLE entity_search_docs DROP CONSTRAINT IF EXISTS entity_search_docs_entity_type_chk;
  ALTER TABLE entity_search_docs ADD CONSTRAINT entity_search_docs_entity_type_chk
    CHECK (entity_type IN ('ORDER','SERIAL_UNIT','RECEIVING','SKU','REPAIR',
                           'FBA_SHIPMENT','WARRANTY_CLAIM','SUPPORT_TICKET',
                           'LOCATION'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE entity_search_outbox DROP CONSTRAINT IF EXISTS entity_search_outbox_entity_type_chk;
  ALTER TABLE entity_search_outbox ADD CONSTRAINT entity_search_outbox_entity_type_chk
    CHECK (entity_type IN ('ORDER','SERIAL_UNIT','RECEIVING','SKU','REPAIR',
                           'FBA_SHIPMENT','WARRANTY_CLAIM','SUPPORT_TICKET',
                           'LOCATION'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. locations → LOCATION ─────────────────────────────────────────────────
-- Generic dispatch (2026-07-03d:160-172): organization_id and id come off NEW,
-- the discriminator off TG_ARGV[0]. No bespoke function.
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_locations_ins ON locations;
CREATE TRIGGER trg_enqueue_search_outbox_on_locations_ins
  AFTER INSERT ON locations
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_entity_search_outbox('LOCATION');

-- DOUBLE-GUARDED (`UPDATE OF` AND `WHEN … IS DISTINCT FROM …`). Both halves
-- earn their keep here: bin rows are re-SET in bulk by the bay/label printers
-- and the bin-registration paths (bulk upserts that rewrite the whole row with
-- mostly unchanged values), and `locked_for_count` is toggled on and off by
-- every cycle count — so `UPDATE OF` alone would re-embed a wall of bins on
-- each sweep, and the WHEN clause alone would wake the trigger for capacity /
-- sort_order writes the doc does not index.
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_locations_upd ON locations;
CREATE TRIGGER trg_enqueue_search_outbox_on_locations_upd
  AFTER UPDATE OF barcode, name, display_name, room, row_label, col_label,
    zone_letter, bin_type, bin_role, location_kind, description,
    is_active, locked_for_count
  ON locations
  FOR EACH ROW
  WHEN (OLD.barcode          IS DISTINCT FROM NEW.barcode
     OR OLD.name             IS DISTINCT FROM NEW.name
     OR OLD.display_name     IS DISTINCT FROM NEW.display_name
     OR OLD.room             IS DISTINCT FROM NEW.room
     OR OLD.row_label        IS DISTINCT FROM NEW.row_label
     OR OLD.col_label        IS DISTINCT FROM NEW.col_label
     OR OLD.zone_letter      IS DISTINCT FROM NEW.zone_letter
     OR OLD.bin_type         IS DISTINCT FROM NEW.bin_type
     OR OLD.bin_role         IS DISTINCT FROM NEW.bin_role
     OR OLD.location_kind    IS DISTINCT FROM NEW.location_kind
     OR OLD.description      IS DISTINCT FROM NEW.description
     OR OLD.is_active        IS DISTINCT FROM NEW.is_active
     OR OLD.locked_for_count IS DISTINCT FROM NEW.locked_for_count)
  EXECUTE FUNCTION fn_enqueue_entity_search_outbox('LOCATION');

-- ── 3. Parent-delete integrity: EVERY discriminator, no silent gaps ─────────
-- Contract point 5 (2026-07-03d:320-337): the shared TG_ARGV[0] dispatch drops
-- the doc AND any pending outbox row, so the worker cannot resurrect a doc for
-- a row that is gone. locations is normally RETIRED via is_active=false (which
-- the UPDATE trigger above refreshes rather than removes); this covers the hard
-- DELETE — a bin de-registration or an admin purge — which that path never sees.
DROP TRIGGER IF EXISTS trg_delete_search_docs_on_locations_delete ON locations;
CREATE TRIGGER trg_delete_search_docs_on_locations_delete
  AFTER DELETE ON locations
  FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_search_docs_on_parent_delete('LOCATION');

-- ── 4. sku_catalog UPDATE trigger: + provider_item_id ───────────────────────
-- Re-cut of 2026-07-03d:258-273 with ONE column added. provider_item_id is the
-- join key to `items`, so first-linking or re-pointing a catalog row must
-- refresh its doc — otherwise the Zoho item number the loader now folds in
-- would never reach the doc of a row that was linked after its last edit. The
-- INSERT trigger and the parent-delete trigger are untouched: neither depends
-- on the watched column list.
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_catalog_upd ON sku_catalog;
CREATE TRIGGER trg_enqueue_search_outbox_on_sku_catalog_upd
  AFTER UPDATE OF sku, product_title, category, upc, ean, gtin, notes,
    lifecycle_status, is_active, provider_item_id
  ON sku_catalog
  FOR EACH ROW
  WHEN (OLD.sku              IS DISTINCT FROM NEW.sku
     OR OLD.product_title    IS DISTINCT FROM NEW.product_title
     OR OLD.category         IS DISTINCT FROM NEW.category
     OR OLD.upc              IS DISTINCT FROM NEW.upc
     OR OLD.ean              IS DISTINCT FROM NEW.ean
     OR OLD.gtin             IS DISTINCT FROM NEW.gtin
     OR OLD.notes            IS DISTINCT FROM NEW.notes
     OR OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status
     OR OLD.is_active        IS DISTINCT FROM NEW.is_active
     OR OLD.provider_item_id IS DISTINCT FROM NEW.provider_item_id)
  EXECUTE FUNCTION fn_enqueue_entity_search_outbox('SKU');

-- ── 5. Backfill: seed LOCATION, re-enqueue the linked SKUs ──────────────────
-- Enqueue only — never a direct write to entity_search_docs. A new entity type
-- has no existing docs to re-enqueue, so the LOCATION seed reads the parent
-- table; the worker still builds every title/subtitle/facet/embedding through
-- the one builder. ON CONFLICT targets the live pending predicate
-- (2026-07-04a:50-52).
--
-- Inactive bins ARE seeded (see mirror-law note 1): a retired shelf keeps its
-- printed label, so it must remain findable and read back as INACTIVE.
-- locations.organization_id is NOT NULL, so no org filter is needed.
INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
SELECT l.organization_id, 'LOCATION', l.id
  FROM locations l
ON CONFLICT (organization_id, entity_type, entity_id)
WHERE processed_at IS NULL AND claimed_at IS NULL
DO NOTHING;

-- The SKU docs already exist; they simply predate the items join. Re-enqueue
-- ONLY the rows that actually gained content — a catalog row with no provider
-- link has nothing new to fold in, and re-embedding the whole catalog to
-- discover that would burn the drain budget for no recall.
INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
SELECT sc.organization_id, 'SKU', sc.id
  FROM sku_catalog sc
 WHERE sc.provider_item_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM items i
      WHERE i.zoho_item_id = sc.provider_item_id
        AND i.organization_id = sc.organization_id
   )
ON CONFLICT (organization_id, entity_type, entity_id)
WHERE processed_at IS NULL AND claimed_at IS NULL
DO NOTHING;

COMMIT;
