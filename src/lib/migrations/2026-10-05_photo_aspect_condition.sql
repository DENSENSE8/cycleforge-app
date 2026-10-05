-- ============================================================================
-- 2026-10-05_photo_aspect_condition.sql
--
-- WHAT: adds 'condition' to the photos.photo_aspect vocabulary by replacing
-- photos_photo_aspect_chk with the 2026-08-01b list plus 'condition'.
--
-- WHY: prepack evidence is typed (serial · condition · contents). SERIAL_UNIT
-- `prepack` photos resolve to the packing stage, which now carries aspects
-- (src/lib/photos/photo-aspects.ts ASPECTS_BY_STAGE.packing). 'condition' is the
-- one prepack shot no existing aspect describes. VOCABULARY SoT stays
-- PHOTO_ASPECTS; keep this CHECK list identical to it.
--
-- SAFETY: widening a CHECK only — every existing row satisfies the new list.
-- DROP + ADD runs in one transaction; idempotent (DROP IF EXISTS). The ADD
-- validates existing rows (small, indexed partial set of non-NULL aspects).
--
-- ROLLBACK (only once no row carries 'condition'):
--   UPDATE photos SET photo_aspect = NULL WHERE photo_aspect = 'condition';
--   ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_photo_aspect_chk;
--   ALTER TABLE photos ADD CONSTRAINT photos_photo_aspect_chk CHECK (photo_aspect IS NULL
--     OR photo_aspect IN ('shipping_label','box_exterior','box_interior','packing_material',
--     'included','serial','front','back','side','bottom'));
--
-- VERIFY:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'photos_photo_aspect_chk';   -- lists 'condition'
-- ============================================================================

BEGIN;

ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_photo_aspect_chk;

ALTER TABLE photos ADD CONSTRAINT photos_photo_aspect_chk
  CHECK (photo_aspect IS NULL OR photo_aspect IN (
    'shipping_label',
    'box_exterior',
    'box_interior',
    'packing_material',
    'included',
    'serial',
    'condition',
    'front',
    'back',
    'side',
    'bottom'
  ));

COMMIT;
