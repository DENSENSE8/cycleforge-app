-- ============================================================================
-- 2026-08-09: locations.location_kind — typed hierarchy for rooms / desks / staging
-- ============================================================================
-- Packing stations are physical DESK (or STAGING) rows under a Packing ROOM on
-- the existing `locations` map — not a parallel packing_stations registry.
-- Wave B1 / Ready-to-Pack placement (order_pack_placements) reads this column.
--
-- Safety: additive NOT NULL DEFAULT 'BIN'; backfill is pure SQL; no writers
-- depend on location_kind yet. Seed is idempotent per (organization_id, barcode).
--
-- ROLLBACK:
--   DELETE FROM locations WHERE barcode LIKE 'PACK-%'
--     AND organization_id = '00000000-0000-0000-0000-000000000001';
--   ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_location_kind_check;
--   ALTER TABLE locations DROP COLUMN IF EXISTS location_kind;
-- ============================================================================

BEGIN;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS location_kind TEXT NOT NULL DEFAULT 'BIN';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'locations_location_kind_check'
  ) THEN
    ALTER TABLE locations
      ADD CONSTRAINT locations_location_kind_check
      CHECK (location_kind IN (
        'ROOM', 'DESK', 'RACK', 'SHELF', 'POSITION', 'BIN', 'STAGING', 'OTHER'
      ));
  END IF;
END $$;

COMMENT ON COLUMN locations.location_kind IS
  'Typed place in the warehouse hierarchy. ROOM/DESK/STAGING are containers or benches; BIN/POSITION are typical putaway leaves.';

-- Room parents: zone_letter is the SoT mark on parent rows (bins keep it NULL).
-- Legacy seed rooms without a zone letter but also without a barcode stay ROOM.
-- Special barcode bins (TECH-PARTS, UNSORTED, …) remain BIN.
UPDATE locations
   SET location_kind = 'ROOM'
 WHERE location_kind = 'BIN'
   AND (
     zone_letter IS NOT NULL
     OR (parent_id IS NULL AND barcode IS NULL AND row_label IS NULL AND col_label IS NULL)
   );

CREATE INDEX IF NOT EXISTS idx_locations_org_kind_active
  ON locations (organization_id, location_kind)
  WHERE is_active = true;

-- ── Seed Packing Floor + 3 desks + staging (USAV dogfood org) ───────────────
-- Barcodes: PACK-ROOM, PACK-DESK-01..03, PACK-STAGING. Names globally unique
-- (locations.name UNIQUE legacy).

-- zone_letter stays NULL: idx_locations_zone_letter_unique_active is global,
-- and packing desks are resolved by barcode / location_kind, not zone letter.
-- Prefer an existing dogfood room named "Packing Station 1" (legacy seed) as
-- the packing ROOM parent; otherwise create "Pack Floor". Desk names avoid
-- colliding with locations.name UNIQUE (legacy "Packing Station 1" is a room).
UPDATE locations
   SET location_kind = 'ROOM',
       barcode = COALESCE(NULLIF(BTRIM(barcode), ''), 'PACK-ROOM'),
       description = COALESCE(
         description,
         'Outbound packing room — desks and staging for ready-to-pack cartons'
       )
 WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
   AND name = 'Packing Station 1'
   AND row_label IS NULL
   AND col_label IS NULL;

INSERT INTO locations (
  name, room, barcode, is_active, sort_order,
  bin_role, locked_for_count, warehouse_id, zone_letter,
  location_kind, organization_id, description
)
SELECT
  'Pack Floor',
  'Pack Floor',
  'PACK-ROOM',
  TRUE,
  200,
  'RESERVE',
  FALSE,
  1,
  NULL,
  'ROOM',
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Outbound packing room — desks and staging for ready-to-pack cartons'
WHERE NOT EXISTS (
  SELECT 1 FROM locations
   WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
     AND (
       barcode = 'PACK-ROOM'
       OR (name = 'Packing Station 1' AND row_label IS NULL AND col_label IS NULL)
     )
);

INSERT INTO locations (
  name, room, barcode, is_active, sort_order,
  bin_role, locked_for_count, warehouse_id, zone_letter,
  location_kind, parent_id, organization_id, description
)
SELECT
  v.name,
  COALESCE(
    (SELECT room FROM locations
      WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
        AND (
          barcode = 'PACK-ROOM'
          OR (name = 'Packing Station 1' AND row_label IS NULL AND col_label IS NULL)
        )
      ORDER BY CASE WHEN barcode = 'PACK-ROOM' THEN 0 ELSE 1 END
      LIMIT 1),
    'Pack Floor'
  ),
  v.barcode,
  TRUE,
  v.sort_order,
  'STAGING'::bin_role_enum,
  FALSE,
  1,
  NULL,
  v.kind,
  (SELECT id FROM locations
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND (
        barcode = 'PACK-ROOM'
        OR (name = 'Packing Station 1' AND row_label IS NULL AND col_label IS NULL)
      )
    ORDER BY CASE WHEN barcode = 'PACK-ROOM' THEN 0 ELSE 1 END
    LIMIT 1),
  '00000000-0000-0000-0000-000000000001'::uuid,
  v.description
FROM (VALUES
  ('Pack Desk 1', 'PACK-DESK-01', 210, 'DESK',    'Packing bench 1 — ready-to-pack cartons'),
  ('Pack Desk 2', 'PACK-DESK-02', 220, 'DESK',    'Packing bench 2 — ready-to-pack cartons'),
  ('Pack Desk 3', 'PACK-DESK-03', 230, 'DESK',    'Packing bench 3 — ready-to-pack cartons'),
  ('Pack Staging', 'PACK-STAGING', 240, 'STAGING', 'Packing-room overflow staging before pack')
) AS v(name, barcode, sort_order, kind, description)
WHERE NOT EXISTS (
  SELECT 1 FROM locations l
   WHERE l.barcode = v.barcode
     AND l.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
)
AND EXISTS (
  SELECT 1 FROM locations
   WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
     AND (
       barcode = 'PACK-ROOM'
       OR (name = 'Packing Station 1' AND row_label IS NULL AND col_label IS NULL)
     )
);

COMMIT;
