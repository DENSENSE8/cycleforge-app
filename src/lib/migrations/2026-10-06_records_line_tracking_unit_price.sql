-- 2026-10-06_records_line_tracking_unit_price.sql
-- Records sheet Phase 1 slice 6 (docs/refactors/records/
-- PROMPT-records-sheet-handoff-2026-10-06.md §3B): per-LINE inbound tracking
-- and a per-unit outbound price.
--
-- WHAT
--   1. shipment_links_owner_type_check widened to ('RECEIVING', 'ORDER',
--      'RECEIVING_LINE'). A RECEIVING_LINE link is one receiving_line ↔ one
--      shipment (owner_id = receiving_line.id), next to the carton's RECEIVING
--      link. Writers: src/lib/inbound/ingest-purchase.ts and
--      update-identity.ts (stampInboundLineShipment in
--      src/lib/shipping/shipment-links.ts).
--   2. fn_enqueue_search_outbox_shipment_link(): ORDER and RECEIVING owners
--      enqueue exactly as before; a RECEIVING_LINE owner enqueues its line's
--      carton as 'RECEIVING' (the line has no search doc of its own). A line
--      with no carton (or already deleted) resolves to a NULL id, which
--      fn_search_outbox_enqueue_one drops.
--   3. trg_delete_shipment_links_on_receiving_line_delete: deleting a line
--      deletes its RECEIVING_LINE links — the same owner-delete trigger
--      receiving_carton (RECEIVING) and orders (ORDER) already carry. Lines
--      are deleted from six code paths and CASCADE from their carton, so
--      without it every one of those would orphan the link.
--   4. Backfill, per line from its carton's primary shipment
--      (receiving_carton.shipment_id):
--        a. receiving_line.shipment_id where NULL (a set value is kept),
--        b. one primary RECEIVING_LINE link (role 'LINE', source
--           'backfill_carton_primary', box_seq 1) for every line whose
--           shipment_id is set and that has no primary RECEIVING_LINE link.
--   5. orders.unit_price NUMERIC(12,2) + backfill (only where NULL):
--        a. ShipStation-linked rows (shipstation_order_refs.order_row_id)
--           whose non-adjustment line_items, across all refs, number exactly
--           ONE priced item → that item's unitPrice. A 0 unitPrice counts only
--           when the order total is > 0 (ShipStation's "0 with nothing priced"
--           means unknown — the same rule toCanonicalLine applies to
--           sale_amount). Multi-item rows stay NULL: the ShipStation import
--           collapses a whole order into ONE row, so it has no single unit
--           price, and its sale_amount is the order total (tax + shipping).
--        b. Rows with no ShipStation ref → round(sale_amount / quantity, 2)
--           where quantity is a positive whole number (sale_amount is the
--           line total for these sources).
--
-- WHY
--   The Records sheet shows inbound tracking per line and an outbound unit
--   price. Inbound tracking lived only on the carton; receiving_line.shipment_id
--   existed but no writer filled it. orders.sale_amount is not reliably a line
--   total (ShipStation rows carry the order total), so a unit price cannot be
--   derived at read time.
--
-- SAFETY
--   Transactional; idempotent: the CHECK swap is guarded on the new value
--   already being present, CREATE OR REPLACE / DROP TRIGGER IF EXISTS, every
--   backfill write is "only where NULL" / NOT EXISTS / ON CONFLICT DO NOTHING.
--   Sizes 2026-10-06: shipment_links 6,561, receiving_line 3,331,
--   orders 5,404 — the CHECK re-validation and backfills are sub-second.
--   The line UPDATE fires receiving_line's BEFORE UPDATE triggers: updated_at
--   is bumped on the stamped lines; fn_stamp_receiving_line_received_done_at
--   would stamp DONE lines lacking received_done_at — measured 0 such lines
--   among the backfill set. orders has no BEFORE UPDATE trigger and its
--   search-outbox UPDATE trigger does not watch unit_price. Each new
--   RECEIVING_LINE link enqueues its carton's search doc once (outbox
--   dedupes per entity). Writers in the same deploy read/write
--   orders.unit_price and owner_type 'RECEIVING_LINE': apply this before
--   that code serves traffic.
--
-- ROLLBACK
--   DELETE FROM shipment_links WHERE owner_type = 'RECEIVING_LINE';
--   DROP TRIGGER IF EXISTS trg_delete_shipment_links_on_receiving_line_delete ON receiving_line;
--   restore the CHECK to ('RECEIVING','ORDER') and the trigger function body
--   from 2026-09-11a_search_outbox_join_table_triggers.sql;
--   ALTER TABLE orders DROP COLUMN IF EXISTS unit_price;
--   (receiving_line.shipment_id fills are facts copied from the carton; to
--   undo: UPDATE receiving_line rl SET shipment_id = NULL FROM shipment_links sl
--   WHERE sl.owner_type = 'RECEIVING_LINE' AND sl.owner_id = rl.id
--   AND sl.source = 'backfill_carton_primary' — before deleting the links.)
--
-- VERIFY (read-only dry counts on production, 2026-10-06, before apply)
--   receiving_line: 3,331 lines; 1,738 already carry shipment_id; 1,253 will
--     be stamped from their carton; 308 have no carton; 8 carry a shipment
--     that differs from their carton's (kept). → 2,991 lines with a
--     shipment_id and 2,991 RECEIVING_LINE primary links (0 exist today).
--   orders.unit_price: 1,581 of 5,404 rows filled —
--     713 ShipStation single-item (755 SS-linked rows: 713 single priced,
--     15 multi-item → NULL, 27 with no non-adjustment items → NULL),
--     868 non-ShipStation rows from sale_amount / quantity (56 with qty > 1);
--     3,781 non-ShipStation rows have no sale_amount → NULL.
--   After apply:
--     SELECT count(*) FROM shipment_links WHERE owner_type = 'RECEIVING_LINE'           -- 2991
--     SELECT count(*) FROM receiving_line WHERE shipment_id IS NOT NULL                 -- 2991
--     SELECT count(*) FROM orders WHERE unit_price IS NOT NULL                          -- 1581

-- ── 1. owner_type CHECK gains RECEIVING_LINE ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'shipment_links'::regclass
       AND conname = 'shipment_links_owner_type_check'
       AND pg_get_constraintdef(oid) LIKE '%RECEIVING_LINE%'
  ) THEN
    ALTER TABLE shipment_links DROP CONSTRAINT IF EXISTS shipment_links_owner_type_check;
    ALTER TABLE shipment_links ADD CONSTRAINT shipment_links_owner_type_check
      CHECK (owner_type IN ('RECEIVING', 'ORDER', 'RECEIVING_LINE'));
  END IF;
END $$;

-- ── 2. search outbox: a line link re-enqueues the line's carton ─────────────
CREATE OR REPLACE FUNCTION fn_enqueue_search_outbox_shipment_link()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.owner_type = 'RECEIVING_LINE' THEN
      PERFORM fn_search_outbox_enqueue_one(
        OLD.organization_id,
        'RECEIVING',
        (SELECT rl.receiving_id::bigint FROM receiving_line rl
          WHERE rl.id = OLD.owner_id AND rl.organization_id = OLD.organization_id));
    ELSE
      PERFORM fn_search_outbox_enqueue_one(
        OLD.organization_id,
        CASE OLD.owner_type WHEN 'ORDER' THEN 'ORDER'
                            WHEN 'RECEIVING' THEN 'RECEIVING' END,
        OLD.owner_id);
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF NEW.owner_type = 'RECEIVING_LINE' THEN
      PERFORM fn_search_outbox_enqueue_one(
        NEW.organization_id,
        'RECEIVING',
        (SELECT rl.receiving_id::bigint FROM receiving_line rl
          WHERE rl.id = NEW.owner_id AND rl.organization_id = NEW.organization_id));
    ELSE
      PERFORM fn_search_outbox_enqueue_one(
        NEW.organization_id,
        CASE NEW.owner_type WHEN 'ORDER' THEN 'ORDER'
                            WHEN 'RECEIVING' THEN 'RECEIVING' END,
        NEW.owner_id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- ── 3. a deleted line takes its RECEIVING_LINE links with it ────────────────
DROP TRIGGER IF EXISTS trg_delete_shipment_links_on_receiving_line_delete ON receiving_line;
CREATE TRIGGER trg_delete_shipment_links_on_receiving_line_delete
  AFTER DELETE ON receiving_line
  FOR EACH ROW EXECUTE FUNCTION fn_delete_shipment_links_on_owner_delete('RECEIVING_LINE');

-- ── 4a. stamp each line with its carton's primary shipment ──────────────────
UPDATE receiving_line rl
   SET shipment_id = rc.shipment_id
  FROM receiving_carton rc
 WHERE rc.id = rl.receiving_id
   AND rc.organization_id = rl.organization_id
   AND rc.shipment_id IS NOT NULL
   AND rl.shipment_id IS NULL;

-- ── 4b. one primary RECEIVING_LINE link per stamped line ────────────────────
INSERT INTO shipment_links
  (organization_id, owner_type, owner_id, shipment_id, box_seq, is_primary,
   direction, role, source)
SELECT rl.organization_id, 'RECEIVING_LINE', rl.id, rl.shipment_id, 1, true,
       'INBOUND', 'LINE', 'backfill_carton_primary'
  FROM receiving_line rl
 WHERE rl.shipment_id IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM shipment_links sl
          WHERE sl.organization_id = rl.organization_id
            AND sl.owner_type = 'RECEIVING_LINE'
            AND sl.owner_id = rl.id
            AND sl.is_primary)
ON CONFLICT DO NOTHING;

-- ── 5. orders.unit_price ────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2);

COMMENT ON COLUMN orders.unit_price IS
  'Price of ONE unit on this order line, in orders.currency. Set only when the source states a single per-unit price (ShipStation: the order''s one non-adjustment item; Ecwid: the item price; manual entry: the unit price typed) or when sale_amount is a line total over a whole-number quantity (sale_amount / quantity). NULL when the row has no single unit price — e.g. a ShipStation order collapsed from several items, or a Shopify/Square order total. First write wins on import, like sale_amount.';

-- 5a. ShipStation: exactly one non-adjustment item across the row's refs.
WITH ss AS (
  SELECT r.organization_id,
         r.order_row_id,
         COUNT(e.item) AS n_items,
         MIN((e.item->>'unitPrice')::numeric)
           FILTER (WHERE jsonb_typeof(e.item->'unitPrice') = 'number') AS unit_price,
         MAX(r.order_total) AS order_total
    FROM shipstation_order_refs r
    LEFT JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(r.line_items) = 'array' THEN r.line_items ELSE '[]'::jsonb END
         ) AS e(item)
      ON (e.item->'adjustment') IS DISTINCT FROM 'true'::jsonb
   GROUP BY r.organization_id, r.order_row_id
)
UPDATE orders o
   SET unit_price = ss.unit_price
  FROM ss
 WHERE ss.organization_id = o.organization_id
   AND ss.order_row_id = o.id
   AND o.unit_price IS NULL
   AND ss.n_items = 1
   AND ss.unit_price IS NOT NULL
   AND (ss.unit_price > 0 OR ss.order_total > 0);

-- 5b. Every other row: line total ÷ whole-number quantity.
UPDATE orders o
   SET unit_price = round(o.sale_amount / btrim(o.quantity)::int, 2)
 WHERE o.unit_price IS NULL
   AND o.sale_amount IS NOT NULL
   AND btrim(o.quantity) ~ '^[1-9][0-9]{0,8}$'
   AND NOT EXISTS (
         SELECT 1 FROM shipstation_order_refs r
          WHERE r.organization_id = o.organization_id
            AND r.order_row_id = o.id);
