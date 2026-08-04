-- ============================================================================
-- 2026-08-03: Returns testing bin — RECEIVING destination for return cartons
-- ============================================================================
-- Seeds a single 'RETURNS-TEST' location that receiving auto-stages into when
-- a return carton label is scanned at the receiving station.
--
-- Context:
--   Operators need a physical returns tote/shelf for QC testing. Role RETURNS
--   keeps units non-pickable (same pickability block as QUARANTINE / DAMAGED).
--   Mirrors the TECH-PARTS special-bin seed pattern.
--
-- Properties:
--   bin_role = 'RETURNS'   → non-pickable (QC / returns hold).
--   sort_order = 997       → near TECH-PARTS (998) / UNSORTED (999).
--   zone_letter = NULL     → bins don't carry a zone letter (only parent room
--                            rows do); a value would collide under
--                            idx_locations_zone_letter_unique_active.
--   room = 'Receiving'     → physical home of the returns testing tote.
--   is_active = true       → eligible for staging / scan.
--   warehouse_id = 1       → matches the existing locations.
--
-- Idempotent: NOT EXISTS guard on (organization_id, barcode). Safe to re-run.
-- ============================================================================

BEGIN;

INSERT INTO locations (
  name, room, barcode, is_active, sort_order,
  bin_role, locked_for_count,
  warehouse_id, zone_letter,
  organization_id
)
SELECT
  'Returns — Testing',
  'Receiving',
  'RETURNS-TEST',
  TRUE,
  997,
  'RETURNS',
  FALSE,
  1,
  NULL,
  '00000000-0000-0000-0000-000000000001'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM locations
   WHERE barcode = 'RETURNS-TEST'
     AND organization_id = '00000000-0000-0000-0000-000000000001'::uuid
);

COMMIT;

-- After applying, receiving resolves barcode → id at runtime (cached):
--   RETURNS_TEST_BIN_BARCODE=RETURNS-TEST (optional env override)
