-- ============================================================================
-- 2026-09-26 brands_4: entity_search_docs carries the SKU brand; brand, Zoho
--                      item and catalog-brand writes re-index the docs
-- ============================================================================
-- Phase 1 "Search integration" of docs/refactors/sidebar/BACKEND-HANDOFF.md,
-- evidence in docs/refactors/sidebar/phase0-findings.md §"Existing SKU
-- search-doc build (entity_search_docs)" and §2.7.
--
-- WHAT
--   1. entity_search_docs.brand_id — the doc's SKU brand NODE (the leaf, which
--      may be a product_line such as Wave under Bose), stamped by the worker
--      only when the catalog brand is a FACT (sku_catalog.brand_confidence
--      >= 0.90, SKU_BRAND_JOIN_ON_SQL in src/lib/sku/sku-identity-law.ts).
--      ORDER / SERIAL_UNIT / RECEIVING docs carry the brand of the SKU they
--      hold (RECEIVING: the first branded line, by receiving_line.id). Powers
--      /api/global-search axis=brand (`brand_id = ANY($ids::int[])`, a plain
--      int predicate that stays an Index Cond under FORCE RLS as app_tenant)
--      and the brand facet. Composite FK to product_brands(organization_id,
--      id) so a doc can never point at another tenant's brand; ON DELETE SET
--      NULL (brand_id) only (PG15+ column list — organization_id is NOT NULL).
--   2. sku_catalog UPDATE trigger re-cut (latest: 2026-09-12b:283-299) with
--      brand_id + brand_confidence in BOTH the UPDATE OF list and the WHEN
--      clause: the SKU doc's brand text and brand_id read both.
--   3. Carrier fan-out. ORDER / SERIAL_UNIT / RECEIVING docs fold in the brand
--      of the SKU they carry, keyed exactly as the worker loaders key it
--      (src/lib/search/search-outbox-worker.ts LOADER_SQL): orders.sku,
--      serial_units.sku and receiving_line.sku, each + organization_id (the
--      identity-law join, SKU_CATALOG_JOIN_ON_SQL). When the FACT brand a
--      catalog row exposes changes — brand_id or brand_confidence crossing
--      0.90, a branded row's sku renamed, a branded row inserted or deleted —
--      every carrier doc of that sku is enqueued. Sub-threshold proposal
--      writes (the backfill's 0.60 listing / 0.30 compat rows) change no
--      doc and do NOT fan out, so the review queue cannot re-embed the order
--      history.
--   4. items trigger (none existed — phase0 §Existing SKU search-doc build,
--      and 2026-09-12b NAMED GAP b). The SKU loader now reads the Zoho twin
--      by the identity law (items.sku + organization_id, status = 'active',
--      skuCatalogNoZohoTwinPredicateSql) — its name GOVERNS the SKU doc title
--      (resolveSkuIdentityTitle) and its brand / manufacturer text is
--      indexed. So a Zoho rename, brand edit, (de)activation or re-SKU must
--      refresh the SKU docs of catalog rows with that sku in that org.
--   5. fn_search_outbox_enqueue_brand(p_org, p_brand_ids) — called by the
--      brand CRUD (src/lib/brands/**) after a rename / alias / parent /
--      active edit. Enqueues the SKU docs whose FACT brand is one of the ids
--      or any descendant (recursive over product_brands.parent_brand_id,
--      org-scoped; a renamed Bose must reach Wave SKUs, whose doc text
--      carries every ancestor's name and aliases), plus those SKUs' carrier
--      docs (3). Returns the number of SKU rows enqueued.
--   6. idx_orders_org_sku — the fan-out probes orders by (organization_id,
--      sku); the only sku index on orders is the trigram GIN on lower(sku),
--      which an equality cannot use. serial_units and receiving_line already
--      carry btree(sku) indexes (idx_serial_units_sku, idx_receiving_lines_sku).
--
-- IDENTITY-LAW NOTE. 2026-09-12b:15-30 and 2026-07-22:5-6 joined items only
-- through sku_catalog.provider_item_id ("never by SKU string"). The operator's
-- 2026-09-15 SKU identity law supersedes that for identity: the Zoho item
-- that governs a catalog row is the ACTIVE items row with the same sku in the
-- same org (sku-identity-law.ts skuCatalogNoZohoTwinPredicateSql). The worker
-- now joins that way; provider_item_id stays indexed as a catalog column.
--
-- ─── TRIGGER INVENTORY (table → event → enqueued entity_type) ───────────────
--   sku_catalog  UPDATE OF (… + brand_id, brand_confidence)       → SKU
--                INSERT  WHEN NEW is a fact brand                  → ORDER + SERIAL_UNIT + RECEIVING carriers
--                UPDATE OF (sku, brand_id, brand_confidence)
--                  WHEN the exposed FACT brand (or a branded sku) changed
--                                                                  → carriers of OLD.sku and NEW.sku
--                DELETE  WHEN OLD was a fact brand                 → carriers of OLD.sku
--   items        INSERT / DELETE                                   → SKU (sku + org twins)
--                UPDATE OF (name, brand, manufacturer, status, sku,
--                  upc, ean, zoho_item_id, organization_id)        → SKU (OLD and NEW twins)
--
-- ─── UPDATE OF / builder mirror law (2026-07-03d:36-37) ────────────────────
-- The items watch list mirrors exactly what LOADER_SQL.SKU reads from the
-- twin: name (title), brand + manufacturer (brand text), status (the join
-- predicate), sku + organization_id (the join key), upc / ean / zoho_item_id
-- (indexed identifiers). Named deviation: items.image_url / rate / stock
-- columns are NOT watched — no builder reads them, and the Zoho poller
-- rewrites them every sweep. Every UPDATE trigger is DOUBLE-GUARDED
-- (`UPDATE OF` + `WHEN … IS DISTINCT FROM`), per 2026-07-03d:152-158: the
-- Zoho poller blanket-SETs unchanged values on every interval.
--
-- ─── NAMED GAPS (not closed here, not silently skipped) ────────────────────
--   a. A Zoho item rename does not refresh SERIAL_UNIT docs (their title reads
--      items.name by serial_units.zoho_item_id). Pre-existing, out of scope:
--      this migration only adds the SKU edge the brand work needs.
--   b. product_brand_aliases / product_brands edits are NOT triggered here;
--      the brand CRUD calls fn_search_outbox_enqueue_brand explicitly after
--      the write (one set-based enqueue per edit instead of one per alias
--      row, and a parent re-point needs the old AND new subtree, which only
--      the caller knows).
--
-- ─── ORG RESOLUTION ────────────────────────────────────────────────────────
-- Every enqueue carries the TRIGGERING row's organization_id and matches
-- parents inside that org only (sku + organization_id), never a global sku
-- match — sku strings collide across tenants (phase0: live global
-- sku_catalog_sku_key drift, the BOSE-SLM2-BK "shared SKU string" probe).
-- Row-at-a-time sites funnel through fn_search_outbox_enqueue_one
-- (2026-09-11a:167-182), so the pending-dedupe ON CONFLICT predicate
--   ux_entity_search_outbox_pending (organization_id, entity_type, entity_id)
--   WHERE processed_at IS NULL AND claimed_at IS NULL   (2026-07-04a:50-52)
-- still lives in exactly one function.
--
-- ─── SAFETY GATING ─────────────────────────────────────────────────────────
-- * REQUIRES, applied first (filename order guarantees it):
--     2026-09-26_brands_1_product_brands.sql   (product_brands, UNIQUE(organization_id, id))
--     2026-09-26_brands_2_sku_catalog_brand.sql (sku_catalog.brand_id / brand_confidence)
--     2026-09-26_brands_3_items_zoho_brand.sql  (items.brand / items.manufacturer)
-- * Additive: one NULLable column (all existing docs NULL → the FK validates
--   trivially), one partial index on entity_search_docs (the FK's
--   referencing-side index for ON DELETE SET NULL, and the axis=brand
--   probe), one index on orders (built inside this transaction: SHARE lock on
--   orders for the build — milliseconds at ~5k rows), triggers and
--   functions. No data is rewritten; nothing writes entity_search_docs
--   directly — the worker owns doc content.
-- * DEPLOY ORDER: this migration BEFORE the worker / global-search code that
--   reads it. LOADER_SQL now selects sku_catalog.brand_id / brand_confidence,
--   product_brands and items.brand / manufacturer, and upsertDocs writes
--   entity_search_docs.brand_id; a worker deployed first fails its loads and
--   dead-letters after 5 attempts (recoverable by re-enqueue, but docs stay
--   stale meanwhile). The code is harmless against this schema in the other
--   direction: an old worker simply never stamps brand_id.
-- * Idempotent / re-runnable: ADD COLUMN IF NOT EXISTS, guarded FK DO block,
--   CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP TRIGGER IF
--   EXISTS + CREATE TRIGGER, and ON CONFLICT DO NOTHING enqueues.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_items_ins ON items;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_items_upd ON items;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_sku_brand_carriers_ins ON sku_catalog;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_sku_brand_carriers_upd ON sku_catalog;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_sku_brand_carriers_del ON sku_catalog;
--   DROP FUNCTION IF EXISTS fn_search_outbox_enqueue_brand(UUID, INTEGER[]);
--   DROP FUNCTION IF EXISTS fn_enqueue_search_outbox_items_sku();
--   DROP FUNCTION IF EXISTS fn_enqueue_search_outbox_sku_brand_carriers();
--   DROP FUNCTION IF EXISTS fn_search_outbox_enqueue_sku_carriers(UUID, TEXT[]);
--   DROP INDEX IF EXISTS idx_orders_org_sku;
--   DROP INDEX IF EXISTS idx_entity_search_docs_org_brand;
--   ALTER TABLE entity_search_docs DROP CONSTRAINT IF EXISTS entity_search_docs_brand_fk;
--   ALTER TABLE entity_search_docs DROP COLUMN IF EXISTS brand_id;
--   -- and restore the 2026-09-12b sku_catalog UPDATE trigger (without the
--   -- two brand columns):
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_catalog_upd ON sku_catalog;
--   CREATE TRIGGER trg_enqueue_search_outbox_on_sku_catalog_upd
--     AFTER UPDATE OF sku, product_title, category, upc, ean, gtin, notes,
--       lifecycle_status, is_active, provider_item_id
--     ON sku_catalog FOR EACH ROW
--     WHEN (OLD.sku IS DISTINCT FROM NEW.sku
--        OR OLD.product_title IS DISTINCT FROM NEW.product_title
--        OR OLD.category IS DISTINCT FROM NEW.category
--        OR OLD.upc IS DISTINCT FROM NEW.upc
--        OR OLD.ean IS DISTINCT FROM NEW.ean
--        OR OLD.gtin IS DISTINCT FROM NEW.gtin
--        OR OLD.notes IS DISTINCT FROM NEW.notes
--        OR OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status
--        OR OLD.is_active IS DISTINCT FROM NEW.is_active
--        OR OLD.provider_item_id IS DISTINCT FROM NEW.provider_item_id)
--     EXECUTE FUNCTION fn_enqueue_entity_search_outbox('SKU');
--   -- (a code rollback must ship with it: the worker's upsert names brand_id)
--
-- VERIFY (after apply; <org> a real org, <sku_id> a sku_catalog row in it
-- whose sku is on at least one order, <bose> a product_brands id):
--   -- 1. column, FK, indexes
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'entity_search_docs_brand_fk';
--   SELECT indexname FROM pg_indexes
--    WHERE indexname IN ('idx_entity_search_docs_org_brand', 'idx_orders_org_sku');
--   -- 2. trigger inventory
--   SELECT tgrelid::regclass, tgname FROM pg_trigger
--    WHERE NOT tgisinternal
--      AND tgrelid IN ('sku_catalog'::regclass, 'items'::regclass)
--    ORDER BY 1, 2;
--   -- 3. a fact-brand write fans out; a proposal write does not
--   BEGIN; SET LOCAL app.current_org = '<org>';
--   UPDATE sku_catalog SET brand_id = <bose>, brand_confidence = 0.60 WHERE id = <sku_id>;
--   SELECT entity_type, COUNT(*) FROM entity_search_outbox
--    WHERE processed_at IS NULL GROUP BY 1;          -- SKU +1 only
--   UPDATE sku_catalog SET brand_confidence = 0.95 WHERE id = <sku_id>;
--   SELECT entity_type, COUNT(*) FROM entity_search_outbox
--    WHERE processed_at IS NULL GROUP BY 1;          -- + that sku's ORDER/SERIAL_UNIT/RECEIVING
--   ROLLBACK;
--   -- 4. the brand CRUD hook reaches descendants
--   BEGIN; SET LOCAL app.current_org = '<org>';
--   SELECT fn_search_outbox_enqueue_brand('<org>', ARRAY[<bose>]);  -- Bose + Wave SKUs
--   ROLLBACK;
--   -- 5. a blanket no-op Zoho poll does not enqueue
--   UPDATE items SET name = name WHERE organization_id = '<org>';   -- inside BEGIN/ROLLBACK
--   -- 6. after a drain, docs carry the brand
--   SELECT entity_type, COUNT(*) FROM entity_search_docs
--    WHERE brand_id IS NOT NULL GROUP BY 1;
-- ============================================================================

BEGIN;

-- ── 1. entity_search_docs.brand_id ──────────────────────────────────────────
ALTER TABLE entity_search_docs ADD COLUMN IF NOT EXISTS brand_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'entity_search_docs_brand_fk'
       AND conrelid = 'entity_search_docs'::regclass
  ) THEN
    ALTER TABLE entity_search_docs
      ADD CONSTRAINT entity_search_docs_brand_fk
      FOREIGN KEY (organization_id, brand_id)
      REFERENCES product_brands (organization_id, id)
      ON DELETE SET NULL (brand_id);
  END IF;
END $$;

-- Org-led so the axis=brand probe and the facet GROUP BY are index-driven
-- under RLS; partial because most docs (REPAIR, FBA, tickets, bins, and
-- unbranded products) never carry a brand.
CREATE INDEX IF NOT EXISTS idx_entity_search_docs_org_brand
  ON entity_search_docs (organization_id, brand_id)
  WHERE brand_id IS NOT NULL;

COMMENT ON COLUMN entity_search_docs.brand_id IS
  'SKU brand node (leaf; may be a product_line) of the doc''s product — SKU docs: sku_catalog.brand_id; ORDER / SERIAL_UNIT / RECEIVING: the carried SKU''s (RECEIVING: first branded line). Stamped by src/lib/search/search-outbox-worker.ts only when sku_catalog.brand_confidence >= 0.90 (a fact). Roll up to the root brand in TS (brandRoot).';

-- ── 2. sku_catalog UPDATE trigger: + brand_id, brand_confidence ─────────────
-- Re-cut of 2026-09-12b:283-299 with two columns added. brand_confidence is
-- watched on its own because a proposal promoted to a fact (0.60 → 0.95)
-- changes the doc without touching brand_id.
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_sku_catalog_upd ON sku_catalog;
CREATE TRIGGER trg_enqueue_search_outbox_on_sku_catalog_upd
  AFTER UPDATE OF sku, product_title, category, upc, ean, gtin, notes,
    lifecycle_status, is_active, provider_item_id, brand_id, brand_confidence
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
     OR OLD.provider_item_id IS DISTINCT FROM NEW.provider_item_id
     OR OLD.brand_id         IS DISTINCT FROM NEW.brand_id
     OR OLD.brand_confidence IS DISTINCT FROM NEW.brand_confidence)
  EXECUTE FUNCTION fn_enqueue_entity_search_outbox('SKU');

-- ── 3. Carrier fan-out: the docs that fold in a SKU's brand ─────────────────
-- orders.sku, serial_units.sku, receiving_line.sku — each matched inside the
-- org, the same keys LOADER_SQL.ORDER / .SERIAL_UNIT / .RECEIVING join
-- sku_catalog on. Set-driven, row-enqueued through the one ON CONFLICT site.
CREATE INDEX IF NOT EXISTS idx_orders_org_sku
  ON orders (organization_id, sku)
  WHERE sku IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_search_outbox_enqueue_sku_carriers(
  p_org  UUID,
  p_skus TEXT[]
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_org IS NULL OR p_skus IS NULL OR cardinality(p_skus) = 0 THEN
    RETURN;  -- no tenant, no sku: nothing we may index
  END IF;

  PERFORM fn_search_outbox_enqueue_one(p_org, c.entity_type, c.entity_id)
     FROM (
       SELECT 'ORDER'::TEXT AS entity_type, o.id::BIGINT AS entity_id
         FROM orders o
        WHERE o.organization_id = p_org
          AND o.sku = ANY(p_skus)
       UNION
       SELECT 'SERIAL_UNIT'::TEXT, su.id::BIGINT
         FROM serial_units su
        WHERE su.organization_id = p_org
          AND su.sku = ANY(p_skus)
       UNION
       -- The RECEIVING doc is the carton; a carton with three lines of the
       -- sku is enqueued once (UNION dedupes).
       SELECT 'RECEIVING'::TEXT, r.id::BIGINT
         FROM receiving_line rl
         JOIN receiving_carton r
           ON r.id = rl.receiving_id
          AND r.organization_id = rl.organization_id
        WHERE rl.organization_id = p_org
          AND rl.sku = ANY(p_skus)
     ) c;
END;
$$;

-- A catalog row's FACT brand as the carrier docs see it: brand_id when
-- brand_confidence >= 0.90 (SKU_BRAND_FACT_MIN_CONFIDENCE), else nothing.
CREATE OR REPLACE FUNCTION fn_enqueue_search_outbox_sku_brand_carriers()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN          -- UPDATE | DELETE: the docs holding OLD.sku
    PERFORM fn_search_outbox_enqueue_sku_carriers(OLD.organization_id, ARRAY[OLD.sku]);
  END IF;

  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE'
         AND (OLD.sku IS DISTINCT FROM NEW.sku
              OR OLD.organization_id IS DISTINCT FROM NEW.organization_id)) THEN
    -- the docs holding NEW.sku (on a plain brand change OLD covered them)
    PERFORM fn_search_outbox_enqueue_sku_carriers(NEW.organization_id, ARRAY[NEW.sku]);
  END IF;

  RETURN NULL;  -- AFTER trigger: return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_sku_brand_carriers_ins ON sku_catalog;
CREATE TRIGGER trg_enqueue_search_outbox_sku_brand_carriers_ins
  AFTER INSERT ON sku_catalog
  FOR EACH ROW
  WHEN (NEW.brand_id IS NOT NULL AND NEW.brand_confidence >= 0.90)
  EXECUTE FUNCTION fn_enqueue_search_outbox_sku_brand_carriers();

-- Fires only when the brand a carrier doc would show actually changes: the
-- fact brand moved (set, cleared, re-pointed, or crossed 0.90 either way), or
-- a row that exposes a fact brand changed its sku (orders of the old sku
-- lose it, orders of the new sku gain it).
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_sku_brand_carriers_upd ON sku_catalog;
CREATE TRIGGER trg_enqueue_search_outbox_sku_brand_carriers_upd
  AFTER UPDATE OF sku, brand_id, brand_confidence ON sku_catalog
  FOR EACH ROW
  WHEN ((CASE WHEN OLD.brand_confidence >= 0.90 THEN OLD.brand_id END)
          IS DISTINCT FROM
        (CASE WHEN NEW.brand_confidence >= 0.90 THEN NEW.brand_id END)
     OR (OLD.sku IS DISTINCT FROM NEW.sku
         AND ((OLD.brand_id IS NOT NULL AND OLD.brand_confidence >= 0.90)
           OR (NEW.brand_id IS NOT NULL AND NEW.brand_confidence >= 0.90))))
  EXECUTE FUNCTION fn_enqueue_search_outbox_sku_brand_carriers();

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_sku_brand_carriers_del ON sku_catalog;
CREATE TRIGGER trg_enqueue_search_outbox_sku_brand_carriers_del
  AFTER DELETE ON sku_catalog
  FOR EACH ROW
  WHEN (OLD.brand_id IS NOT NULL AND OLD.brand_confidence >= 0.90)
  EXECUTE FUNCTION fn_enqueue_search_outbox_sku_brand_carriers();

-- ── 4. items → the SKU docs of its sku + org twins ──────────────────────────
-- One sku_catalog row per (organization_id, sku) (sku_catalog_org_sku_key),
-- so each side is a single unique-index probe. OLD is resolved on UPDATE
-- only when the join key moved: re-SKUing an item must refresh the catalog
-- row it LEFT as well as the one it joined.
CREATE OR REPLACE FUNCTION fn_enqueue_search_outbox_items_sku()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE'
         AND (OLD.sku IS DISTINCT FROM NEW.sku
              OR OLD.organization_id IS DISTINCT FROM NEW.organization_id)) THEN
    PERFORM fn_search_outbox_enqueue_one(sc.organization_id, 'SKU', sc.id::BIGINT)
       FROM sku_catalog sc
      WHERE sc.sku = OLD.sku
        AND sc.organization_id = OLD.organization_id;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    PERFORM fn_search_outbox_enqueue_one(sc.organization_id, 'SKU', sc.id::BIGINT)
       FROM sku_catalog sc
      WHERE sc.sku = NEW.sku
        AND sc.organization_id = NEW.organization_id;
  END IF;

  RETURN NULL;
END;
$$;

-- INSERT and DELETE share one trigger (no WHEN clause can reference both).
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_items_ins ON items;
CREATE TRIGGER trg_enqueue_search_outbox_on_items_ins
  AFTER INSERT OR DELETE ON items
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_search_outbox_items_sku();

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_items_upd ON items;
CREATE TRIGGER trg_enqueue_search_outbox_on_items_upd
  AFTER UPDATE OF name, brand, manufacturer, status, sku, upc, ean,
    zoho_item_id, organization_id
  ON items
  FOR EACH ROW
  WHEN (OLD.name            IS DISTINCT FROM NEW.name
     OR OLD.brand           IS DISTINCT FROM NEW.brand
     OR OLD.manufacturer    IS DISTINCT FROM NEW.manufacturer
     OR OLD.status          IS DISTINCT FROM NEW.status
     OR OLD.sku             IS DISTINCT FROM NEW.sku
     OR OLD.upc             IS DISTINCT FROM NEW.upc
     OR OLD.ean             IS DISTINCT FROM NEW.ean
     OR OLD.zoho_item_id    IS DISTINCT FROM NEW.zoho_item_id
     OR OLD.organization_id IS DISTINCT FROM NEW.organization_id)
  EXECUTE FUNCTION fn_enqueue_search_outbox_items_sku();

-- ── 5. Brand CRUD hook ──────────────────────────────────────────────────────
-- UNION (not UNION ALL) in the recursive arm stops a parent cycle from
-- looping; every step is pinned to p_org, so a foreign-org child can never be
-- walked into. Only FACT rows are re-indexed: a sub-threshold row's docs do
-- not show the brand, so its text cannot change with a brand edit.
CREATE OR REPLACE FUNCTION fn_search_outbox_enqueue_brand(
  p_org       UUID,
  p_brand_ids INTEGER[]
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_sku_ids BIGINT[];
  v_skus    TEXT[];
BEGIN
  IF p_org IS NULL OR p_brand_ids IS NULL OR cardinality(p_brand_ids) = 0 THEN
    RETURN 0;
  END IF;

  WITH RECURSIVE subtree(id) AS (
    SELECT pb.id
      FROM product_brands pb
     WHERE pb.organization_id = p_org
       AND pb.id = ANY(p_brand_ids)
    UNION
    SELECT child.id
      FROM product_brands child
      JOIN subtree s ON child.parent_brand_id = s.id
     WHERE child.organization_id = p_org
  )
  SELECT array_agg(sc.id::BIGINT), array_agg(DISTINCT sc.sku)
    INTO v_sku_ids, v_skus
    FROM sku_catalog sc
   WHERE sc.organization_id = p_org
     AND sc.brand_id IN (SELECT id FROM subtree)
     AND sc.brand_confidence >= 0.90;

  IF v_sku_ids IS NULL THEN
    RETURN 0;
  END IF;

  PERFORM fn_search_outbox_enqueue_one(p_org, 'SKU', sku_id)
     FROM unnest(v_sku_ids) AS sku_id;
  PERFORM fn_search_outbox_enqueue_sku_carriers(p_org, v_skus);

  RETURN cardinality(v_sku_ids);
END;
$$;

-- ── 6. Backfill — order-independent with the brand backfill ─────────────────
-- Enqueue only. (a) The SKU loader now reads the Zoho twin by sku + org and
-- indexes its brand text: re-index every catalog row whose content moves —
-- rows with an active sku+org twin, and rows that were fed by the retired
-- provider_item_id join. (b) If brand facts already exist (the brand
-- backfill ran between brands_2 and this file), push them through the same
-- hook the CRUD uses: every root brand's subtree covers every node.
INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
SELECT sc.organization_id, 'SKU', sc.id
  FROM sku_catalog sc
 WHERE sc.provider_item_id IS NOT NULL
    OR EXISTS (
         SELECT 1 FROM items i
          WHERE i.sku = sc.sku
            AND i.organization_id = sc.organization_id
            AND i.status = 'active'
       )
ON CONFLICT (organization_id, entity_type, entity_id)
WHERE processed_at IS NULL AND claimed_at IS NULL
DO NOTHING;

SELECT fn_search_outbox_enqueue_brand(roots.organization_id, roots.ids)
  FROM (
    SELECT pb.organization_id, array_agg(pb.id) AS ids
      FROM product_brands pb
     WHERE pb.parent_brand_id IS NULL
     GROUP BY pb.organization_id
  ) roots;

COMMIT;
