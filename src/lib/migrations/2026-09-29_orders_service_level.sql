-- ============================================================================
-- 2026-09-29i: orders.service_level — the shipping speed the buyer paid for.
-- ============================================================================
-- Owner 2026-09-29: an order imported from ShipStation as Next day / 2-day /
-- Expedited (or carrying an air service such as fedex_2day_one_rate) is urgent
-- automatically. The fact is classified in TS (src/lib/shipping/service-level.ts,
-- words in the SERVICE_LEVEL token registry) and written by the ShipStation
-- connector after it pairs refs to rows (applyOrderServiceLevels).
--
-- Kept apart from is_urgent, which stays the operator's toggle: the connector
-- sets is_urgent only when service_level CHANGES to an urgent level, so an
-- operator who clears urgent is never re-flagged by a later sync.
--
-- The CHECK names the registry keys; a new level is a new migration.
-- orders is already tenant-scoped + RLS-armed; a nullable column needs no
-- enforce call. Backfill runs from TS (one classifier), not here.
-- Rollback: ALTER TABLE orders DROP COLUMN IF EXISTS service_level;
-- ----------------------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_level TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_service_level_check') THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_service_level_check
      CHECK (service_level IS NULL OR service_level IN
        ('nextDay', 'secondDay', 'expedited', 'standard', 'economy', 'pickup'));
  END IF;
END $$;
