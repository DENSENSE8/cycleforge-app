-- 2026-09-24_label_ingestions_shipstation_source.sql
-- label_ingestions learns a fourth source: labels pulled from ShipStation's
-- API by the historical-label backfill
-- (src/lib/label-ingestions/sources/shipstation-history.ts,
--  scripts/backfill-shipstation-labels.ts).
--
-- Why new columns and not sha256 alone: ShipStation re-renders the label PDF
-- on every download (measured 2026-09-24: two downloads of the same label
-- hashed differently), so the byte hash cannot make a re-run a no-op. The
-- ShipStation shipment id (v1 `/shipments.shipmentId`; the v2 label id is
-- `se-<shipmentId>`) is the stable identity. sha256 stays unique per org as
-- before — a byte-identical PDF is still refused twice.
--
--   shipstation_shipment_id  v1 shipment id; unique per org when present
--   shipstation_label_id     v2 label id the PDF was fetched from
--   source                   + 'SHIPSTATION_API'; such a row MUST carry its
--                            shipment id (and no other source may)
--
-- Additive: two nullable columns, a widened CHECK, a partial unique index.
-- Existing rows (none are SHIPSTATION_API) satisfy every new constraint.
-- Tenancy unchanged: label_ingestions is already FORCE-RLS
-- (2026-09-18_v1_label_ingestions.sql) and every writer stamps
-- organization_id inside withTenantTransaction.
--
-- ROLLBACK (after deleting SHIPSTATION_API rows):
--   DROP INDEX IF EXISTS ux_label_ingestions_org_shipstation_shipment;
--   ALTER TABLE label_ingestions DROP CONSTRAINT IF EXISTS label_ingestions_shipstation_identity_chk;
--   ALTER TABLE label_ingestions DROP CONSTRAINT IF EXISTS label_ingestions_source_chk;
--   ALTER TABLE label_ingestions ADD CONSTRAINT label_ingestions_source_chk
--     CHECK (source IN ('WATCHED_FOLDER', 'BROWSER_FIXTURE', 'MANUAL_UPLOAD'));
--   ALTER TABLE label_ingestions DROP COLUMN IF EXISTS shipstation_label_id;
--   ALTER TABLE label_ingestions DROP COLUMN IF EXISTS shipstation_shipment_id;

ALTER TABLE label_ingestions ADD COLUMN IF NOT EXISTS shipstation_shipment_id BIGINT;
ALTER TABLE label_ingestions ADD COLUMN IF NOT EXISTS shipstation_label_id TEXT;

ALTER TABLE label_ingestions DROP CONSTRAINT IF EXISTS label_ingestions_source_chk;
ALTER TABLE label_ingestions ADD CONSTRAINT label_ingestions_source_chk
  CHECK (source IN ('WATCHED_FOLDER', 'BROWSER_FIXTURE', 'MANUAL_UPLOAD', 'SHIPSTATION_API'));

ALTER TABLE label_ingestions DROP CONSTRAINT IF EXISTS label_ingestions_shipstation_identity_chk;
ALTER TABLE label_ingestions ADD CONSTRAINT label_ingestions_shipstation_identity_chk
  CHECK ((source = 'SHIPSTATION_API') = (shipstation_shipment_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS ux_label_ingestions_org_shipstation_shipment
  ON label_ingestions (organization_id, shipstation_shipment_id)
  WHERE shipstation_shipment_id IS NOT NULL;
