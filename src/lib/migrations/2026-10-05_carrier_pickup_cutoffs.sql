-- ============================================================================
-- 2026-10-05_carrier_pickup_cutoffs.sql
--
-- WHAT: `carrier_pickup_cutoffs` — the time each carrier's truck leaves the
--       dock, per weekday, so the Live feed (`/operations/live-feed`,
--       `/m/live-feed`) can count down "USPS pickup 3:00 PM — 12 not packed".
--       Edited on `/settings/pickup-cutoffs`; read/written only through
--       src/lib/live-feed/pickup-cutoffs.ts.
--
-- GRAIN: one row per (org, carrier, weekday). A carrier with no row for a
--       weekday has no pickup that day. `weekday` is the warehouse calendar
--       weekday, 0 = Sunday … 6 = Saturday (JS getUTCDay / weekdayOfDateKey);
--       `cutoff_local` is the wall-clock time in the warehouse zone, resolved
--       to an instant per day by the reader (so DST never shifts the cutoff).
--
-- CARRIER KEY: stored exactly as UPPER(BTRIM(shipping_tracking_numbers.carrier))
--       — the key the Live feed board groups packages by — so a cutoff joins
--       1:1 with the board. The CHECK pins that shape; the TS normalizer is
--       `normalizePickupCarrier` (src/lib/live-feed/pickup-cutoffs-shared.ts).
--
-- TENANT-FROM-BIRTH: `organization_id UUID NOT NULL`, no DEFAULT in the DDL;
--       enforce_tenant_isolation() installs the loud-fail GUC default, FORCE
--       RLS and the canonical policy. Safe at birth: the table has no writers
--       yet, and its only writer (replacePickupCutoffs) runs in
--       withTenantTransaction and stamps organization_id explicitly.
--
-- ROLLBACK: select relax_tenant_isolation('carrier_pickup_cutoffs');
--           DROP TABLE IF EXISTS carrier_pickup_cutoffs;
--
-- VERIFY:
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'carrier_pickup_cutoffs';
--   \d carrier_pickup_cutoffs   -- PK (organization_id, carrier, weekday)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS carrier_pickup_cutoffs (
  organization_id     UUID NOT NULL,                    -- no DEFAULT; helper installs the loud-fail GUC default
  carrier             TEXT NOT NULL,
  weekday             SMALLINT NOT NULL,
  cutoff_local        TIME NOT NULL,
  updated_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One cutoff per carrier per weekday, per org; also the read path.
  CONSTRAINT carrier_pickup_cutoffs_pkey PRIMARY KEY (organization_id, carrier, weekday),
  CONSTRAINT carrier_pickup_cutoffs_weekday_range CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT carrier_pickup_cutoffs_carrier_shape CHECK (carrier = UPPER(BTRIM(carrier)) AND carrier <> '')
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('carrier_pickup_cutoffs');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — carrier_pickup_cutoffs left without FORCE RLS';
  END IF;
END $$;

COMMIT;
