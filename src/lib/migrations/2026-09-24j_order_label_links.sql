-- 2026-09-24j_order_label_links.sql
-- One order, several labels: `shipping_label_purchases` becomes the order's
-- label list (in-app buys, ShipStation imports and operator-paired labels),
-- each carrying WHY it exists (purpose) and HOW it got here (creation type).
--
--   purpose        outbound (default — every existing row) | return | replacement
--   creation_type  bought_in_app (default — every existing row)
--                  | imported_shipstation  (the ShipStation label backfill)
--                  | linked_manually       (an operator paired it: Link label)
--   status         + 'unlinked' — an operator took a paired label off the order;
--                  the row stays so the adapter never re-imports it.
--
-- New columns tie a row to its ShipStation / ingestion identity and cost:
--   shipstation_shipment_id  v1 shipment id (label id `se-<id>`); joins
--                            shipstation_shipment_refs for shipment/insurance cost
--   label_ingestion_id       the label_ingestions row it came from (import/pair)
--   insurance_cost           insurance the label carried, when known
--   linked_by / linked_at, unlinked_by / unlinked_at — who paired / unpaired it
--
-- A live label (pending/purchased) belongs to ONE order: the partial unique
-- index on (organization_id, label_id) refuses a second live row for the same
-- ShipStation label (idempotent re-link; cross-order link is a 409 upstream).
--
-- label_ingestions learns state 'LINKED': a QUARANTINED ShipStation label an
-- operator paired to an order (e.g. the second live label on one order —
-- MULTI_PACKAGE_EVIDENCE — paired as a replacement). It is resolved, not
-- applied: no tracking/document attach, matched_order_id set. Unlinking moves
-- it back to QUARANTINED. APPLIED stays terminal (trigger unchanged).
--
-- Backfill: every APPLIED ShipStation-imported label already on an order gets
-- its ledger row (imported_shipstation / outbound) so the order's label list is
-- one read. Idempotent (NOT EXISTS + ON CONFLICT on the per-org client key).
--
-- Safety gating: additive columns with defaults that describe every existing
-- row; CHECK widenings only add values. Both tables are already FORCE-RLS and
-- every writer stamps organization_id under tenantQuery/withTenantTransaction.
--
-- ROLLBACK (after deleting non-default rows):
--   DELETE FROM shipping_label_purchases WHERE creation_type <> 'bought_in_app';
--   UPDATE label_ingestions SET state = 'QUARANTINED', matched_order_id = NULL WHERE state = 'LINKED';
--   ALTER TABLE label_ingestions DROP CONSTRAINT label_ingestions_state_chk;
--   ALTER TABLE label_ingestions ADD CONSTRAINT label_ingestions_state_chk
--     CHECK (state IN ('RECEIVED','STAGED','PARSED','MATCHED','QUARANTINED','APPLYING','APPLIED','FAILED'));
--   DROP INDEX IF EXISTS ux_shipping_label_purchases_org_label_live;
--   DROP INDEX IF EXISTS idx_shipping_label_purchases_org_ss_shipment;
--   ALTER TABLE shipping_label_purchases DROP CONSTRAINT shipping_label_purchases_status_check;
--   ALTER TABLE shipping_label_purchases ADD CONSTRAINT shipping_label_purchases_status_check
--     CHECK (status IN ('pending', 'purchased', 'voided'));
--   ALTER TABLE shipping_label_purchases DROP COLUMN purpose, DROP COLUMN creation_type,
--     DROP COLUMN shipstation_shipment_id, DROP COLUMN label_ingestion_id, DROP COLUMN insurance_cost,
--     DROP COLUMN linked_by, DROP COLUMN linked_at, DROP COLUMN unlinked_by, DROP COLUMN unlinked_at;

ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'outbound';
ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS creation_type TEXT NOT NULL DEFAULT 'bought_in_app';
ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS shipstation_shipment_id BIGINT;
ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS label_ingestion_id BIGINT REFERENCES label_ingestions(id) ON DELETE SET NULL;
ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS insurance_cost NUMERIC(12, 2);
ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS linked_by INTEGER REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ;
ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS unlinked_by INTEGER REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE shipping_label_purchases ADD COLUMN IF NOT EXISTS unlinked_at TIMESTAMPTZ;

ALTER TABLE shipping_label_purchases DROP CONSTRAINT IF EXISTS shipping_label_purchases_purpose_check;
ALTER TABLE shipping_label_purchases ADD CONSTRAINT shipping_label_purchases_purpose_check
  CHECK (purpose IN ('outbound', 'return', 'replacement'));

ALTER TABLE shipping_label_purchases DROP CONSTRAINT IF EXISTS shipping_label_purchases_creation_type_check;
ALTER TABLE shipping_label_purchases ADD CONSTRAINT shipping_label_purchases_creation_type_check
  CHECK (creation_type IN ('bought_in_app', 'imported_shipstation', 'linked_manually'));

ALTER TABLE shipping_label_purchases DROP CONSTRAINT IF EXISTS shipping_label_purchases_status_check;
ALTER TABLE shipping_label_purchases ADD CONSTRAINT shipping_label_purchases_status_check
  CHECK (status IN ('pending', 'purchased', 'voided', 'unlinked'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_shipping_label_purchases_org_label_live
  ON shipping_label_purchases (organization_id, label_id)
  WHERE label_id IS NOT NULL AND status IN ('pending', 'purchased');

CREATE INDEX IF NOT EXISTS idx_shipping_label_purchases_org_ss_shipment
  ON shipping_label_purchases (organization_id, shipstation_shipment_id)
  WHERE shipstation_shipment_id IS NOT NULL;

ALTER TABLE label_ingestions DROP CONSTRAINT IF EXISTS label_ingestions_state_chk;
ALTER TABLE label_ingestions ADD CONSTRAINT label_ingestions_state_chk
  CHECK (state IN ('RECEIVED', 'STAGED', 'PARSED', 'MATCHED', 'QUARANTINED', 'APPLYING', 'APPLIED', 'FAILED', 'LINKED'));

INSERT INTO shipping_label_purchases
  (organization_id, order_id, client_event_id, status, label_id, tracking_number, carrier_code,
   label_document_id, shipment_id, purpose, creation_type, shipstation_shipment_id,
   label_ingestion_id, linked_at, created_at, updated_at)
SELECT li.organization_id,
       li.matched_order_id,
       'shipstation-import:' || li.shipstation_label_id,
       'purchased',
       li.shipstation_label_id,
       li.tracking_number_raw,
       li.carrier,
       li.document_id,
       li.shipment_id,
       'outbound',
       'imported_shipstation',
       li.shipstation_shipment_id,
       li.id,
       li.applied_at,
       COALESCE(li.applied_at, li.created_at),
       now()
  FROM label_ingestions li
 WHERE li.source = 'SHIPSTATION_API'
   AND li.state = 'APPLIED'
   AND li.shipstation_label_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM shipping_label_purchases lp
      WHERE lp.organization_id = li.organization_id
        AND lp.label_id = li.shipstation_label_id
   )
ON CONFLICT (organization_id, client_event_id) DO NOTHING;
