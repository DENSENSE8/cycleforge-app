-- 2026-10-07_d_ebay_mirror_tracking_from_po_carton.sql
-- Follow-up to 2026-10-07_c_tracking_scientific_notation_repair.sql.
--
-- That repair looked for an eBay mirror row's true tracking among its own
-- order's lines and its Zoho PO Reference#. One more piece of evidence holds
-- it: the Zoho PO carton whose PO# is the eBay order id (eBay order id = PO#)
-- and the package that carton was scanned with. eBay order 19-15115-65421
-- (mirror row 42956) stored `9.434608106244531e+21`; its PO carton 52619 was
-- scanned with 9434608106244530786660, whose float rendering is exactly that
-- value, and no other number on the order renders to it (the PO's
-- Reference# 9434608106244523940383 is a different package). The repair set
-- the row to NULL; this restores the number.
--
-- Measured before apply: 1 row. Idempotent (only a NULL tracking on a row
-- whose PO carton still holds that scanned package).
-- VERIFY: SELECT tracking_number FROM inbound_purchase_order_mirror WHERE id = 42956;

SET LOCAL extra_float_digits = 1;

UPDATE inbound_purchase_order_mirror m
   SET tracking_number = stn.tracking_number_normalized,
       updated_at = now()
  FROM receiving_carton rc
  JOIN shipping_tracking_numbers stn ON stn.id = rc.shipment_id
 WHERE m.id = 42956
   AND m.source_type = 'ebay'
   AND m.source_order_id = '19-15115-65421'
   AND m.tracking_number IS NULL
   AND rc.organization_id = m.organization_id
   AND rc.zoho_purchaseorder_number = m.source_order_id
   AND stn.tracking_number_normalized::float8::text = '9.434608106244531e+21'
   AND EXISTS (SELECT 1 FROM receiving_scans rs
                WHERE rs.receiving_id = rc.id AND rs.tracking_number = stn.tracking_number_normalized);
