-- 2026-10-07_c_tracking_scientific_notation_repair.sql
-- Records Phase 3 §3.4.1: tracking numbers stored in scientific notation.
--
-- What was wrong: a numeric parse (the eBay Trading XML parser, fixed
-- 2026-10-04 in src/lib/ebay/purchase-client.ts) and Zoho PO Reference#
-- values pasted from a spreadsheet turned 22-digit USPS numbers into
-- `9.434608106244568e+21`. `registerShipmentPermissive` let them into
-- shipping_tracking_numbers and `upsertInboundMirror` into the eBay mirror.
-- Those writers now refuse them (`isScientificNotationTracking`,
-- src/lib/tracking-format.ts); this file repairs the rows already stored and
-- puts the same rule on the tables so no writer can store one again.
--
-- Measured before apply (primary, 2026-10-07):
--   shipping_tracking_numbers   145 rows (3 linked to cartons/lines, 142 orphans)
--   inbound_purchase_order_mirror 89 rows (eBay snapshots)
--   SELECT count(*) FROM shipping_tracking_numbers
--    WHERE btrim(tracking_number_raw) ~* '^\d+(\.\d+)?e[+-]?\d+$';
--   SELECT count(*) FROM inbound_purchase_order_mirror
--    WHERE btrim(tracking_number) ~* '^\d+(\.\d+)?e[+-]?\d+$';
--
-- Recovery: a candidate is the true number only when its float rendering IS
-- the stored value (`isScientificRenderingOf`; Postgres float8 output at
-- extra_float_digits = 1 is the same shortest round-trip text as JS) AND it
-- comes from the row's own evidence — its carton's receiving scans, the
-- carton's own package, its Zoho PO Reference#. Exactly one such candidate or
-- nothing (the same rounded value names different packages on different
-- orders). Expected: 3 of 3 linked packages, 88 of 89 mirror rows.
--   * linked package → its links, lines and carton move to the true package
--     (which already exists); the rounded row is deleted.
--   * orphan package (no owner of any kind; the eBay twin lines it belonged
--     to were removed by scripts/repair-ebay-zoho-twins.ts) → deleted.
--   * mirror row → the true number, else NULL (listed for the operator in
--     docs/refactors/records/sci-notation-tracking-2026-10-07.md).
-- zoho_po_mirror.reference_number is Zoho's own field, mirrored verbatim:
-- the one rounded Reference# (PO 05-15185-97935) is fixed in Zoho by the
-- operator; the sync no longer registers it as a package.
--
-- Safety: fails closed (RAISE) if a true package is missing, an owner already
-- holds the true package, or any reference to a rounded package survives the
-- move. ROLLBACK: none — the deleted rows carry no digits that were not lost.
-- VERIFY: both counts above return 0.

SET LOCAL extra_float_digits = 1;

CREATE TEMP TABLE sci_stn ON COMMIT DROP AS
SELECT id, organization_id, lower(btrim(tracking_number_raw)) AS sci
  FROM shipping_tracking_numbers
 WHERE btrim(tracking_number_raw) ~* '^\d+(\.\d+)?e[+-]?\d+$';

-- The cartons each rounded package belongs to: directly, by a carton link, or through a line.
CREATE TEMP TABLE sci_stn_carton ON COMMIT DROP AS
SELECT s.id AS sci_id, c.carton_id
  FROM sci_stn s
 CROSS JOIN LATERAL (
         SELECT rc.id FROM receiving_carton rc WHERE rc.shipment_id = s.id
         UNION SELECT sl.owner_id FROM shipment_links sl WHERE sl.shipment_id = s.id AND sl.owner_type = 'RECEIVING'
         UNION SELECT rl.receiving_id FROM receiving_line rl WHERE rl.shipment_id = s.id
         UNION SELECT rl.receiving_id
                 FROM shipment_links sl JOIN receiving_line rl ON rl.id = sl.owner_id
                WHERE sl.shipment_id = s.id AND sl.owner_type = 'RECEIVING_LINE'
       ) c(carton_id)
 WHERE c.carton_id IS NOT NULL;

CREATE TEMP TABLE sci_mirror ON COMMIT DROP AS
SELECT m.id, m.organization_id, m.source_type, m.source_order_id, lower(btrim(m.tracking_number)) AS sci
  FROM inbound_purchase_order_mirror m
 WHERE btrim(m.tracking_number) ~* '^\d+(\.\d+)?e[+-]?\d+$';

CREATE TEMP TABLE mirror_carton ON COMMIT DROP AS
SELECT DISTINCT m.id AS mirror_id, rl.receiving_id AS carton_id
  FROM sci_mirror m
  JOIN receiving_line rl
    ON rl.organization_id = m.organization_id
   AND rl.source_order_id = m.source_order_id
   AND rl.inbound_source_type = m.source_type
   AND rl.receiving_id IS NOT NULL;

-- Every number a carton's package is known by.
CREATE TEMP TABLE carton_numbers ON COMMIT DROP AS
SELECT rc.id AS carton_id, d.digits
  FROM receiving_carton rc
 CROSS JOIN LATERAL (
         SELECT regexp_replace(rs.tracking_number, '\s', '', 'g') FROM receiving_scans rs WHERE rs.receiving_id = rc.id
         UNION SELECT stn.tracking_number_normalized FROM shipping_tracking_numbers stn WHERE stn.id = rc.shipment_id
         UNION SELECT stn.tracking_number_normalized
                 FROM shipment_links sl JOIN shipping_tracking_numbers stn ON stn.id = sl.shipment_id
                WHERE sl.owner_type = 'RECEIVING' AND sl.owner_id = rc.id
         UNION SELECT btrim(z.reference_number) FROM zoho_po_mirror z
                WHERE z.organization_id = rc.organization_id AND z.zoho_purchaseorder_id = rc.zoho_purchaseorder_id
         UNION SELECT btrim(z.reference_number)
                 FROM receiving_line rl
                 JOIN zoho_po_mirror z
                   ON z.organization_id = rl.organization_id AND z.zoho_purchaseorder_number = rl.source_order_id
                WHERE rl.receiving_id = rc.id
       ) d(digits)
 WHERE rc.id IN (SELECT carton_id FROM sci_stn_carton UNION SELECT carton_id FROM mirror_carton)
   AND d.digits ~ '^\d{10,34}$';

CREATE TEMP TABLE stn_fix ON COMMIT DROP AS
SELECT s.id AS sci_id, min(cn.digits) AS digits, NULL::bigint AS true_id
  FROM sci_stn s
  JOIN sci_stn_carton sc ON sc.sci_id = s.id
  JOIN carton_numbers cn ON cn.carton_id = sc.carton_id AND cn.digits::float8::text = s.sci
 GROUP BY s.id
HAVING count(DISTINCT cn.digits) = 1;

UPDATE stn_fix f
   SET true_id = stn.id
  FROM shipping_tracking_numbers stn
 WHERE stn.tracking_number_normalized = f.digits;

DO $$
DECLARE
  missing int;
  doubled int;
BEGIN
  SELECT count(*) INTO missing FROM stn_fix WHERE true_id IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'sci repair: % recovered numbers have no package row', missing;
  END IF;
  SELECT count(*) INTO doubled
    FROM shipment_links l
    JOIN stn_fix f ON f.sci_id = l.shipment_id
   WHERE EXISTS (SELECT 1 FROM shipment_links t
                  WHERE t.organization_id = l.organization_id AND t.owner_type = l.owner_type
                    AND t.owner_id = l.owner_id AND t.shipment_id = f.true_id);
  IF doubled > 0 THEN
    RAISE EXCEPTION 'sci repair: % owners already hold the true package', doubled;
  END IF;
END $$;

UPDATE shipment_links l
   SET shipment_id = f.true_id, updated_at = now()
  FROM stn_fix f
 WHERE l.shipment_id = f.sci_id;

UPDATE receiving_line rl
   SET shipment_id = f.true_id, updated_at = now()
  FROM stn_fix f
 WHERE rl.shipment_id = f.sci_id;

UPDATE receiving_carton rc
   SET shipment_id = f.true_id, updated_at = now()
  FROM stn_fix f
 WHERE rc.shipment_id = f.sci_id;

-- Nothing may still point at a rounded package (a cascade would drop it silently).
DO $$
DECLARE
  fk record;
  n bigint;
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[array_length(c.conkey, 1)]
     WHERE c.contype = 'f' AND c.confrelid = 'shipping_tracking_numbers'::regclass
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I IN (SELECT id FROM sci_stn)', fk.tbl, fk.col) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'sci repair: %.% still references % rounded packages', fk.tbl, fk.col, n;
    END IF;
  END LOOP;
END $$;

DELETE FROM shipping_tracking_numbers WHERE id IN (SELECT id FROM sci_stn);

UPDATE inbound_purchase_order_mirror m
   SET tracking_number = (
         SELECT min(c.digits)
           FROM (SELECT cn.digits FROM mirror_carton mc JOIN carton_numbers cn ON cn.carton_id = mc.carton_id
                  WHERE mc.mirror_id = s.id
                 UNION
                 SELECT btrim(z.reference_number) FROM zoho_po_mirror z
                  WHERE z.organization_id = s.organization_id AND z.zoho_purchaseorder_number = s.source_order_id
                    AND btrim(z.reference_number) ~ '^\d{10,34}$') c
          WHERE c.digits::float8::text = s.sci
         HAVING count(DISTINCT c.digits) = 1),
       updated_at = now()
  FROM sci_mirror s
 WHERE m.id = s.id;

ALTER TABLE shipping_tracking_numbers
  ADD CONSTRAINT stn_tracking_not_scientific_chk
  CHECK (btrim(tracking_number_raw) !~* '^\d+(\.\d+)?e[+-]?\d+$');

ALTER TABLE inbound_purchase_order_mirror
  ADD CONSTRAINT inbound_po_mirror_tracking_not_scientific_chk
  CHECK (tracking_number IS NULL OR btrim(tracking_number) !~* '^\d+(\.\d+)?e[+-]?\d+$');
