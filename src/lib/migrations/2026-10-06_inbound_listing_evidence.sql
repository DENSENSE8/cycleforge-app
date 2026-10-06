-- 2026-10-06_inbound_listing_evidence.sql
-- What the purchase LISTING said about an item, landed with the inbound order so
-- unbox can check "as listed" without opening the listing (operator 2026-10-06):
--
--   1. receiving_line.purchase_condition_grade — the condition the item was
--      BOUGHT at (the listing's grade). Separate from
--      receiving_line_testing.condition_grade, which is the grade unbox assigns
--      (stamped by condition_graded_at). Null = the listing said nothing.
--   2. receiving_line_listing_serial — serial numbers the listing showed (seller
--      photos of the serial plate). first_seen_at is when CycleForge first saw
--      the serial — at listing time, not at unbox. Unbox shows them as a
--      reference and stamps confirmed_at when the scanned serial matches.
--   3. receiving_line_return — the Amazon return-report facts that identify a
--      returned unit: FNSKU, license plate number (LPN), detailed disposition,
--      customer comments and the return request date.
--
-- Listing photos need no DDL: they are photos rows with photo_type = 'listing'
-- (seeded by 2026-06-26b_photo_listing_type.sql) linked to RECEIVING_LINE.
--
-- Tenant: receiving_line_listing_serial is tenant-scoped from birth. Its only
-- writer is ingestInboundOrderInTx (inside withTenantTransaction, stamps
-- organization_id explicitly) and the unbox confirm route (stamps explicitly).
--
-- ROLLBACK:
--   select relax_tenant_isolation('receiving_line_listing_serial');
--   DROP TABLE IF EXISTS receiving_line_listing_serial;
--   ALTER TABLE receiving_line DROP COLUMN IF EXISTS purchase_condition_grade;
--   ALTER TABLE receiving_line_return
--     DROP COLUMN IF EXISTS fnsku, DROP COLUMN IF EXISTS license_plate_number,
--     DROP COLUMN IF EXISTS disposition, DROP COLUMN IF EXISTS customer_comment,
--     DROP COLUMN IF EXISTS return_requested_on;
--
-- VERIFY:
--   \d receiving_line_listing_serial
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'receiving_line_return' AND column_name IN
--      ('fnsku','license_plate_number','disposition','customer_comment','return_requested_on');

ALTER TABLE receiving_line
  ADD COLUMN IF NOT EXISTS purchase_condition_grade condition_grade_enum;

CREATE TABLE IF NOT EXISTS receiving_line_listing_serial (
  id                 BIGSERIAL PRIMARY KEY,
  organization_id    UUID NOT NULL,
  receiving_line_id  INTEGER NOT NULL REFERENCES receiving_line(id) ON DELETE CASCADE,
  serial             TEXT NOT NULL,
  serial_norm        TEXT NOT NULL,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  source             TEXT NOT NULL,                 -- 'form' | 'csv' | 'sync'
  confirmed_at       TIMESTAMPTZ,
  confirmed_by       INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT receiving_line_listing_serial_org_line_serial_unique
    UNIQUE (organization_id, receiving_line_id, serial_norm)
);

CREATE INDEX IF NOT EXISTS idx_receiving_line_listing_serial_org_serial
  ON receiving_line_listing_serial (organization_id, serial_norm);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('receiving_line_listing_serial');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — receiving_line_listing_serial left without FORCE RLS';
  END IF;
END $$;

ALTER TABLE receiving_line_return
  ADD COLUMN IF NOT EXISTS fnsku                TEXT,
  ADD COLUMN IF NOT EXISTS license_plate_number TEXT,
  ADD COLUMN IF NOT EXISTS disposition          TEXT,
  ADD COLUMN IF NOT EXISTS customer_comment     TEXT,
  ADD COLUMN IF NOT EXISTS return_requested_on  DATE;
