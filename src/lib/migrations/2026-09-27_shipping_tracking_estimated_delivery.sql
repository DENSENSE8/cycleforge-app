-- Carrier delivery promise on outbound tracking rows.
--
-- What: shipping_tracking_numbers.estimated_delivery_at — the carrier's ETA
-- (FedEx estimatedDeliveryTimeWindow, UPS SDD/RDD, USPS expectedDeliveryDate,
-- ShipStation estimated_delivery_date). Written by updateShipmentSummary on
-- every sync; nulled once the parcel is delivered. The order record reads it
-- as "Arrives Thu, Sep 30" / "late".
--
-- Safety: nullable column, no default, no backfill — existing rows read as
-- "no promise" until their next carrier sync. Table tenancy is unchanged.
--
-- Rollback: ALTER TABLE shipping_tracking_numbers DROP COLUMN IF EXISTS estimated_delivery_at;

ALTER TABLE shipping_tracking_numbers
  ADD COLUMN IF NOT EXISTS estimated_delivery_at TIMESTAMPTZ;
