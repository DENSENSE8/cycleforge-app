-- ============================================================================
-- 2026-09-11a: join-table enqueue triggers — closes the documented
--              entity_search_docs freshness gap on order serials / tracking
-- ============================================================================
-- THE DEFECT (verbatim from 2026-07-03d_entity_search_docs.sql:39-43):
--   "KNOWN GAP (deliberate, documented): order serials/tracking live on join
--    tables (tech_serial_numbers, shipping_tracking_numbers …). Changes there
--    alone do not re-enqueue the order; they surface on the next orders write
--    or a backfill sweep."
-- Consequence in the console: an operator attaches a serial at the tech bench
-- and immediately searches that serial — the ORDER doc's search_text still has
-- the pre-attach serial list, so CommandBar's index arm returns nothing.
--
-- The ORDER doc genuinely depends on four join tables (worker LOADER_SQL,
-- src/lib/search/search-outbox-worker.ts:100-128):
--   • tech_serial_numbers      → `serials` (STRING_AGG of serial_number)
--   • orders.shipment_id → STN → `tracking_number`, `carrier`
--   • shipment_links (ORDER)   → `linked_trackings`, and the STN behind it
--   • (RECEIVING doc mirrors this via receiving_carton.shipment_id → STN,
--      worker LOADER_SQL:162-163)
-- Only the six HEADER tables (2026-07-03d) plus receiving_line /
-- fba_shipment_items (2026-07-04a) had enqueue triggers. This migration adds
-- the missing join-table hooks, modelled exactly on the 2026-07-04a
-- receiving_line / fba_shipment_items precedent (lines 75-156).
--
-- TRIGGER INVENTORY (table → event → enqueued entity_type):
--   tech_serial_numbers     INSERT/DELETE                          → ORDER
--                           UPDATE OF (serial_number, order_id, shipment_id) → ORDER
--   shipment_links          INSERT/DELETE                          → ORDER | RECEIVING (by owner_type)
--                           UPDATE OF (shipment_id, owner_id, owner_type) → ORDER | RECEIVING
--   order_unit_allocations  INSERT/DELETE                          → ORDER + SERIAL_UNIT
--                           UPDATE OF (state, serial_unit_id, order_id)  → ORDER + SERIAL_UNIT
--   shipping_tracking_numbers
--                           UPDATE OF (tracking_number_raw, carrier) → ORDER + RECEIVING
--                                                                      (all resolved parents)
--
-- Every UPDATE trigger is DOUBLE-GUARDED (`UPDATE OF <cols>` AND
-- `WHEN (… IS DISTINCT FROM …)`) per the 2026-07-03d:152-158 law: the carrier
-- poller and the channel syncs blanket-SET unchanged COALESCE values on every
-- interval, and `UPDATE OF` alone would re-enqueue — and therefore re-embed
-- (search-outbox-worker.ts:293-303 always rewrites search_text and re-embeds a
-- drained doc) — every linked row every poll.
--
-- ORG RESOLUTION, PER TABLE (tenant-from-birth: no enqueue without an org):
--   tech_serial_numbers    — own organization_id (added 2026-05-23_org_id_on
--                            _business_tables.sql:62); the ORDER parent is then
--                            matched INSIDE that org.
--   shipment_links         — own organization_id NOT NULL
--                            (2026-06-24_shipment_links.sql:34-35).
--   order_unit_allocations — own organization_id (2026-05-23_org_id_on_business
--                            _tables.sql:55; index proof
--                            2026-06-24_operations_saved_views.sql:88).
--   shipping_tracking_numbers — DELIBERATELY NOT its own organization_id.
--     STN *does* have the column now (added NULLABLE by
--     2026-06-14_org_id_phase_b_needs_col_2.sql:58, "⚠ NULLABLE ON PURPOSE"
--     at :31, and still being healed by 2026-07-14b / 2026-07-15b backfills),
--     so trusting stn.organization_id would silently skip every NULL-org
--     tracking row — exactly the rows the backfills exist for. Instead the
--     trigger resolves org AND parent id THROUGH the parents, using the same
--     four links resolveShipmentOrgId / the 2026-07-14b backfill use:
--       orders.shipment_id, shipment_links(owner_type='ORDER') ⋈ orders,
--       receiving_carton.shipment_id, shipment_links(owner_type='RECEIVING')
--       ⋈ receiving_carton.
--     Each enqueued row therefore carries the PARENT's organization_id, which
--     is by definition non-NULL (both parents are org-NOT-NULL FORCE-RLS
--     tables). shipment_links joins its parent on
--     (owner_id, organization_id) — the exact predicate the worker's own
--     LOADER_SQL uses (search-outbox-worker.ts:119-123), so a link whose org
--     disagrees with its parent contributes nothing here either.
--
-- NO INSERT / DELETE TRIGGER ON shipping_tracking_numbers — by proof, not by
-- omission:
--   • INSERT: a freshly-registered STN has no parent link yet (the link or the
--     parent's shipment_id cache is written after), and that parent write is
--     already a triggered enqueue (2026-07-03d orders/receiving_carton UPDATE
--     OF shipment_id, or shipment_links below).
--   • DELETE: every parent edge self-heals. shipment_links.shipment_id is
--     `ON DELETE CASCADE` (2026-06-24_shipment_links.sql:38) → the
--     shipment_links DELETE trigger below fires; orders.shipment_id
--     (0000_baseline_through_2026-03.sql:1396) and receiving.shipment_id
--     (2026-04-15_receiving_attach_shipment_id.sql:25-26) are
--     `ON DELETE SET NULL` → both header UPDATE-OF-shipment_id triggers fire.
--
-- NAMED REMAINING GAPS (not closed here, not silently skipped):
--   1. tech_serial_numbers → ORDER via shipment_id is enqueued as a SUPERSET.
--      The loader attaches shipment-linked serials only when EXACTLY ONE order
--      in the org shares that shipment (the NOT EXISTS guard,
--      search-outbox-worker.ts:109-115). This trigger deliberately drops that
--      guard and enqueues every order sharing the shipment: over-enqueue costs
--      one idempotent rebuild, under-enqueue is the stale doc this migration
--      exists to kill.
--   2. order_unit_allocations feeds NO field of today's doc. Neither
--      LOADER_SQL.ORDER nor LOADER_SQL.SERIAL_UNIT joins it, and neither
--      buildOrderDoc (build-search-text.ts:129-168) nor buildSerialUnitDoc
--      (:177-203) reads an allocation field — so the UPDATE OF list here
--      mirrors NO builder-read column and is a knowing, NAMED exception to the
--      2026-07-03d:36-37 mirror law. It is wired now because allocation state
--      is the order↔unit edge the doc-enrichment wave indexes, and because a
--      state flip is the one moment the pairing changes. COST, stated plainly:
--      an ALLOCATED→PICKED→PACKED→SHIPPED walk re-embeds both docs up to four
--      times with (currently) identical text. If the enrichment wave does not
--      land, DROP the two order_unit_allocations triggers named in ROLLBACK.
--   3. serial_units.shipping_tracking_number is a denormalized TEXT column (the
--      SERIAL_UNIT doc's only tracking token, build-search-text.ts:188), NOT an
--      STN FK. An STN tracking_number_raw correction does not reach it; it is
--      healed only by a write to serial_units itself (already triggered, and
--      the text column is the thing the unit doc actually indexes). Out of
--      scope: this is a denormalization defect, not a freshness defect.
--   4. repair_service.source_tracking_number is likewise a REPAIR-owned TEXT
--      column, covered by the repair_service header trigger (2026-07-04a:159).
--   5. FBA_SHIPMENT docs read no STN column at all (LOADER_SQL.FBA_SHIPMENT,
--      search-outbox-worker.ts:188-198), so fba_shipment_tracking needs no hook.
--
-- No new entity_type value is introduced, so NEITHER entity_type CHECK
-- (entity_search_docs_entity_type_chk / entity_search_outbox_entity_type_chk)
-- is altered — every type enqueued below (ORDER, SERIAL_UNIT, RECEIVING) is
-- already in both constraints (2026-07-03d:94-96, :129-132).
--
-- Every enqueue targets the LIVE pending partial unique
--   ux_entity_search_outbox_pending (organization_id, entity_type, entity_id)
--   WHERE processed_at IS NULL AND claimed_at IS NULL
-- (2026-07-04a:50-52) — claimed rows are intentionally NOT deduped against, so
-- a join-table write during a drain lands a fresh pending row.
--
-- IDEMPOTENT / re-runnable: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS
-- + CREATE TRIGGER, and an INSERT … ON CONFLICT DO NOTHING backfill.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_tech_serial_numbers_ins ON tech_serial_numbers;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_tech_serial_numbers_upd ON tech_serial_numbers;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_shipment_links_ins ON shipment_links;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_shipment_links_upd ON shipment_links;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_order_unit_allocations_ins ON order_unit_allocations;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_order_unit_allocations_upd ON order_unit_allocations;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_stn_upd ON shipping_tracking_numbers;
--   DROP FUNCTION IF EXISTS fn_enqueue_search_outbox_tech_serial();
--   DROP FUNCTION IF EXISTS fn_enqueue_search_outbox_shipment_link();
--   DROP FUNCTION IF EXISTS fn_enqueue_search_outbox_order_unit_alloc();
--   DROP FUNCTION IF EXISTS fn_enqueue_search_outbox_stn();
--   DROP FUNCTION IF EXISTS fn_search_outbox_enqueue_orders_for_serial(UUID, INTEGER, BIGINT);
--   DROP FUNCTION IF EXISTS fn_search_outbox_enqueue_one(UUID, TEXT, BIGINT);
--   (the backfill's outbox rows are self-clearing — the worker drains them)
--
-- VERIFY (after apply; <org>/<tsn>/<order> are real ids in one org):
--   SET LOCAL app.current_org = '<org>';
--   UPDATE tech_serial_numbers SET serial_number = serial_number || 'X'
--     WHERE id = <tsn>;                     -- one join-table write…
--   SELECT count(*) FROM entity_search_outbox WHERE processed_at IS NULL;
--     -- …enqueues the parent ORDER: count is +1 vs the same SELECT before.
--   UPDATE tech_serial_numbers SET serial_number = serial_number
--     WHERE id = <tsn>;                     -- blanket no-op SET (sync writer)
--   SELECT count(*) FROM entity_search_outbox WHERE processed_at IS NULL;
--     -- unchanged: the WHEN(IS DISTINCT FROM) guard swallowed it.
--   UPDATE shipping_tracking_numbers SET carrier = carrier WHERE id = <stn>;
--   SELECT count(*) FROM entity_search_outbox WHERE processed_at IS NULL;
--     -- unchanged (carrier-poller no-op churn is guarded).
-- ============================================================================

BEGIN;

-- ── 0. One guarded enqueue primitive ────────────────────────────────────────
-- Every row-at-a-time site below funnels through this so the ON CONFLICT
-- predicate exists in exactly one place (the set-based STN path repeats it —
-- both must track ux_entity_search_outbox_pending).
-- Returns silently when the org, the type, or the id is unresolvable: a row we
-- cannot place in a tenant is a row we must not index (tenant-from-birth).
CREATE OR REPLACE FUNCTION fn_search_outbox_enqueue_one(
  p_org         UUID,
  p_entity_type TEXT,
  p_entity_id   BIGINT
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_org IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
  VALUES (p_org, p_entity_type, p_entity_id)
  ON CONFLICT (organization_id, entity_type, entity_id)
  WHERE processed_at IS NULL AND claimed_at IS NULL
  DO NOTHING;
END;
$$;

-- ── 1. tech_serial_numbers → re-enqueue the parent ORDER doc ────────────────
-- Two link paths, mirroring LOADER_SQL.ORDER's tsn join
-- (search-outbox-worker.ts:101-117): the explicit tsn.order_id
-- (2026-07-30_tech_serial_numbers_order_id.sql:18-20), or — when order_id is
-- NULL — the shared shipment (tsn.shipment_id,
-- 0000_baseline_through_2026-03.sql:1397). OLD and NEW are both resolved on
-- UPDATE: re-pointing a serial must refresh the order it LEFT as well as the
-- one it joined.
--
-- The two paths are resolved by SEPARATE index-driven lookups rather than one
-- `id = $1 OR shipment_id = $2` predicate: that OR cannot be served by a
-- single index, and this runs inside every tech/receiving serial write, so the
-- planner is never given the chance to seq-scan `orders`. Path A is the PK
-- (+org) probe; path B is idx_orders_shipment_id
-- (0000_baseline_through_2026-03.sql:1403).
CREATE OR REPLACE FUNCTION fn_search_outbox_enqueue_orders_for_serial(
  p_org         UUID,
  p_order_id    INTEGER,
  p_shipment_id BIGINT
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_order_id BIGINT;
BEGIN
  IF p_org IS NULL THEN
    RETURN;  -- legacy/global serial row: no tenant to index under
  END IF;

  IF p_order_id IS NOT NULL THEN
    -- Path A: the explicit anchor. Probe the parent so we never enqueue a doc
    -- for an order that does not exist in THIS tenant.
    PERFORM 1 FROM orders o WHERE o.id = p_order_id AND o.organization_id = p_org;
    IF FOUND THEN
      PERFORM fn_search_outbox_enqueue_one(p_org, 'ORDER', p_order_id);
    END IF;
    RETURN;
  END IF;

  IF p_shipment_id IS NULL THEN
    RETURN;  -- FNSKU / bench-only serial: no order to refresh
  END IF;

  -- Path B: shared shipment. Deliberately WITHOUT the loader's
  -- single-order NOT EXISTS guard — see NAMED REMAINING GAP #1.
  FOR v_order_id IN
    SELECT o.id
      FROM orders o
     WHERE o.shipment_id = p_shipment_id
       AND o.organization_id = p_org
  LOOP
    PERFORM fn_search_outbox_enqueue_one(p_org, 'ORDER', v_order_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_enqueue_search_outbox_tech_serial()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN          -- UPDATE | DELETE: the pre-image's order
    PERFORM fn_search_outbox_enqueue_orders_for_serial(
      OLD.organization_id, OLD.order_id, OLD.shipment_id);
  END IF;

  IF TG_OP <> 'DELETE' THEN          -- INSERT | UPDATE: the post-image's order
    PERFORM fn_search_outbox_enqueue_orders_for_serial(
      NEW.organization_id, NEW.order_id, NEW.shipment_id);
  END IF;

  RETURN NULL;  -- AFTER trigger: return value is ignored
END;
$$;

-- INSERT and DELETE share one trigger (no WHEN clause can reference both).
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_tech_serial_numbers_ins ON tech_serial_numbers;
CREATE TRIGGER trg_enqueue_search_outbox_on_tech_serial_numbers_ins
  AFTER INSERT OR DELETE ON tech_serial_numbers
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_search_outbox_tech_serial();

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_tech_serial_numbers_upd ON tech_serial_numbers;
CREATE TRIGGER trg_enqueue_search_outbox_on_tech_serial_numbers_upd
  AFTER UPDATE OF serial_number, order_id, shipment_id ON tech_serial_numbers
  FOR EACH ROW
  WHEN (OLD.serial_number IS DISTINCT FROM NEW.serial_number
     OR OLD.order_id      IS DISTINCT FROM NEW.order_id
     OR OLD.shipment_id   IS DISTINCT FROM NEW.shipment_id)
  EXECUTE FUNCTION fn_enqueue_search_outbox_tech_serial();

-- ── 2. shipment_links → re-enqueue the polymorphic OWNER doc ────────────────
-- owner_type is CHECK-constrained to ('RECEIVING','ORDER')
-- (2026-06-24_shipment_links.sql:36) and maps 1:1 onto the search
-- discriminator of the same name; any other value resolves to a NULL type and
-- is dropped by fn_search_outbox_enqueue_one rather than violating
-- entity_search_outbox_entity_type_chk.
-- ORDER owners gain/lose `linked_trackings` (LOADER_SQL.ORDER:96-98);
-- RECEIVING owners are the carton's inbound tracking edge.
CREATE OR REPLACE FUNCTION fn_enqueue_search_outbox_shipment_link()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM fn_search_outbox_enqueue_one(
      OLD.organization_id,
      CASE OLD.owner_type WHEN 'ORDER' THEN 'ORDER'
                          WHEN 'RECEIVING' THEN 'RECEIVING' END,
      OLD.owner_id);
  END IF;

  IF TG_OP <> 'DELETE' THEN
    PERFORM fn_search_outbox_enqueue_one(
      NEW.organization_id,
      CASE NEW.owner_type WHEN 'ORDER' THEN 'ORDER'
                          WHEN 'RECEIVING' THEN 'RECEIVING' END,
      NEW.owner_id);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_shipment_links_ins ON shipment_links;
CREATE TRIGGER trg_enqueue_search_outbox_on_shipment_links_ins
  AFTER INSERT OR DELETE ON shipment_links
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_search_outbox_shipment_link();

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_shipment_links_upd ON shipment_links;
CREATE TRIGGER trg_enqueue_search_outbox_on_shipment_links_upd
  AFTER UPDATE OF shipment_id, owner_id, owner_type ON shipment_links
  FOR EACH ROW
  WHEN (OLD.shipment_id IS DISTINCT FROM NEW.shipment_id
     OR OLD.owner_id    IS DISTINCT FROM NEW.owner_id
     OR OLD.owner_type  IS DISTINCT FROM NEW.owner_type)
  EXECUTE FUNCTION fn_enqueue_search_outbox_shipment_link();

-- ── 3. order_unit_allocations → re-enqueue BOTH sides of the edge ───────────
-- See NAMED REMAINING GAP #2 in the header: this is the one hook whose
-- UPDATE OF list mirrors no column the current builder reads. Both endpoints
-- are enqueued because an allocation is the order↔unit pairing itself, and a
-- re-point (or a release) changes what each side should say.
CREATE OR REPLACE FUNCTION fn_enqueue_search_outbox_order_unit_alloc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM fn_search_outbox_enqueue_one(OLD.organization_id, 'ORDER',       OLD.order_id);
    PERFORM fn_search_outbox_enqueue_one(OLD.organization_id, 'SERIAL_UNIT', OLD.serial_unit_id);
  END IF;

  IF TG_OP <> 'DELETE' THEN
    PERFORM fn_search_outbox_enqueue_one(NEW.organization_id, 'ORDER',       NEW.order_id);
    PERFORM fn_search_outbox_enqueue_one(NEW.organization_id, 'SERIAL_UNIT', NEW.serial_unit_id);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_order_unit_allocations_ins ON order_unit_allocations;
CREATE TRIGGER trg_enqueue_search_outbox_on_order_unit_allocations_ins
  AFTER INSERT OR DELETE ON order_unit_allocations
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_search_outbox_order_unit_alloc();

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_order_unit_allocations_upd ON order_unit_allocations;
CREATE TRIGGER trg_enqueue_search_outbox_on_order_unit_allocations_upd
  AFTER UPDATE OF state, serial_unit_id, order_id ON order_unit_allocations
  FOR EACH ROW
  WHEN (OLD.state          IS DISTINCT FROM NEW.state
     OR OLD.serial_unit_id IS DISTINCT FROM NEW.serial_unit_id
     OR OLD.order_id       IS DISTINCT FROM NEW.order_id)
  EXECUTE FUNCTION fn_enqueue_search_outbox_order_unit_alloc();

-- ── 4. shipping_tracking_numbers → re-enqueue every resolved parent ─────────
-- Set-based on purpose: one STN can carry several parents (split shipments,
-- multi-box cartons). Org comes from the PARENT row, never from
-- stn.organization_id (header: that column is NULLABLE and still being
-- backfilled). Watched columns are exactly the two the docs index:
-- tracking_number_raw → `tracking_number` / `linked_trackings`, carrier →
-- the carrier facet (LOADER_SQL.ORDER:95-99, LOADER_SQL.RECEIVING:151-152).
-- NB: this is the SECOND ON CONFLICT site — it must stay identical to
-- fn_search_outbox_enqueue_one's predicate.
CREATE OR REPLACE FUNCTION fn_enqueue_search_outbox_stn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
  SELECT p.org, p.entity_type, p.entity_id
    FROM (
      -- Outbound: the denormalized primary-tracking cache on the order.
      SELECT o.organization_id AS org, 'ORDER'::TEXT AS entity_type, o.id::BIGINT AS entity_id
        FROM orders o
       WHERE o.shipment_id = NEW.id
         AND o.organization_id IS NOT NULL
      UNION
      -- Outbound: split shipments / extra labels via the linkage SoT.
      SELECT o.organization_id, 'ORDER'::TEXT, o.id::BIGINT
        FROM shipment_links sl
        JOIN orders o
          ON o.id = sl.owner_id
         AND o.organization_id = sl.organization_id
       WHERE sl.shipment_id = NEW.id
         AND sl.owner_type = 'ORDER'
      UNION
      -- Inbound: the carton's primary-tracking cache.
      SELECT r.organization_id, 'RECEIVING'::TEXT, r.id::BIGINT
        FROM receiving_carton r
       WHERE r.shipment_id = NEW.id
         AND r.organization_id IS NOT NULL
      UNION
      -- Inbound: extra boxes on the same carton via the linkage SoT.
      SELECT r.organization_id, 'RECEIVING'::TEXT, r.id::BIGINT
        FROM shipment_links sl
        JOIN receiving_carton r
          ON r.id = sl.owner_id
         AND r.organization_id = sl.organization_id
       WHERE sl.shipment_id = NEW.id
         AND sl.owner_type = 'RECEIVING'
    ) p
  ON CONFLICT (organization_id, entity_type, entity_id)
  WHERE processed_at IS NULL AND claimed_at IS NULL
  DO NOTHING;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_stn_upd ON shipping_tracking_numbers;
CREATE TRIGGER trg_enqueue_search_outbox_on_stn_upd
  AFTER UPDATE OF tracking_number_raw, carrier ON shipping_tracking_numbers
  FOR EACH ROW
  WHEN (OLD.tracking_number_raw IS DISTINCT FROM NEW.tracking_number_raw
     OR OLD.carrier             IS DISTINCT FROM NEW.carrier)
  EXECUTE FUNCTION fn_enqueue_search_outbox_stn();

-- ── 5. Backfill: heal the docs the gap already staled ───────────────────────
-- Enqueue only, NEVER a direct write to entity_search_docs — the worker owns
-- doc content. Narrowed to parents that actually HAVE join-table rows: those
-- are precisely the docs whose text could be missing a serial, a linked
-- tracking, or an allocation. Sweeping every ORDER/SERIAL_UNIT doc would
-- re-embed the whole index for rows with nothing to heal.
INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
SELECT d.organization_id, 'ORDER', d.entity_id
  FROM entity_search_docs d
  JOIN orders o
    ON o.id = d.entity_id
   AND o.organization_id = d.organization_id
 WHERE d.entity_type = 'ORDER'
   AND (
     EXISTS (SELECT 1 FROM tech_serial_numbers tsn
              WHERE tsn.organization_id = o.organization_id
                AND (tsn.order_id = o.id
                     OR (tsn.order_id IS NULL
                         AND o.shipment_id IS NOT NULL
                         AND tsn.shipment_id = o.shipment_id)))
     OR EXISTS (SELECT 1 FROM shipment_links sl
                 WHERE sl.owner_type = 'ORDER'
                   AND sl.owner_id = o.id
                   AND sl.organization_id = o.organization_id)
     OR EXISTS (SELECT 1 FROM order_unit_allocations oua
                 WHERE oua.order_id = o.id
                   AND oua.organization_id = o.organization_id)
   )
ON CONFLICT (organization_id, entity_type, entity_id)
WHERE processed_at IS NULL AND claimed_at IS NULL
DO NOTHING;

INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
SELECT d.organization_id, 'SERIAL_UNIT', d.entity_id
  FROM entity_search_docs d
 WHERE d.entity_type = 'SERIAL_UNIT'
   AND EXISTS (SELECT 1 FROM order_unit_allocations oua
                WHERE oua.serial_unit_id = d.entity_id
                  AND oua.organization_id = d.organization_id)
ON CONFLICT (organization_id, entity_type, entity_id)
WHERE processed_at IS NULL AND claimed_at IS NULL
DO NOTHING;

COMMIT;
