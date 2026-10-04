-- 2026-10-03_locations_arrival_priority_tier.sql
--
-- Arrival urgency shelves. A shelf (any active `locations` row with a barcode)
-- may be marked with the urgency tier of the cartons that belong on it, so
-- Arrival can say "Place on <shelf> (<tier>)" and Unbox can work the most
-- urgent shelf first.
--
-- The tier is the SAME 0..3 contract as receiving_carton.priority_tier,
-- inbound_order.priority_tier and InboundOrderDraft.priority (0 = most
-- urgent; labels in src/lib/receiving/priority-override.ts). NULL = not an
-- arrival shelf. No second urgency vocabulary.
--
-- Readers: src/lib/receiving/arrival-shelves.ts (suggest / confirm placement,
-- unbox-next queue). They fail soft when this column is absent (42703 →
-- "no urgency shelves configured"), so code may ship before this applies.
--
-- Safe now: additive, nullable, no default, no backfill — every existing row
-- reads NULL ("not an arrival shelf"), so no behaviour changes on apply.
-- `locations` is already tenant-owned; the partial index leads with
-- organization_id (per-org reads only) and covers only tiered active shelves,
-- so it stays tiny (a rack is a handful of shelves). The CHECK is added in a
-- guarded block so a re-run never duplicates it.
--
-- Verify after apply:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'locations' AND column_name = 'arrival_priority_tier';
--   EXPLAIN SELECT id FROM locations
--    WHERE organization_id = '<org>' AND is_active AND arrival_priority_tier IS NOT NULL
--    ORDER BY arrival_priority_tier, sort_order, id;
--   Expected: Index Scan using idx_locations_org_arrival_tier.
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_locations_org_arrival_tier;
--   ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_arrival_priority_tier_check;
--   ALTER TABLE locations DROP COLUMN IF EXISTS arrival_priority_tier;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS arrival_priority_tier SMALLINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'locations_arrival_priority_tier_check'
       AND conrelid = 'locations'::regclass
  ) THEN
    ALTER TABLE locations
      ADD CONSTRAINT locations_arrival_priority_tier_check
      CHECK (arrival_priority_tier BETWEEN 0 AND 3);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_locations_org_arrival_tier
  ON locations (organization_id, arrival_priority_tier, sort_order, id)
  WHERE is_active = true AND arrival_priority_tier IS NOT NULL;

COMMENT ON COLUMN locations.arrival_priority_tier IS
  'Arrival urgency shelf tier 0..3 (0 = most urgent; same contract as receiving_carton.priority_tier). NULL = not an arrival shelf. 2026-10-03.';
