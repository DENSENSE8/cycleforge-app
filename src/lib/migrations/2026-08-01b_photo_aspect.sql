-- ============================================================================
-- 2026-08-01b_photo_aspect.sql
--
-- Unbox guided procedure — photo ASPECT, the second axis of receiving evidence.
--
-- WHY A NEW COLUMN AND NOT NEW photo_type VALUES.
-- `photos.photo_type` encodes ENTITY LEGALITY: it is the key of the WRITE_MATRIX
-- in src/lib/photos/stages.ts, of the `require_one` receive gate in
-- src/lib/receiving/photo-policy.ts, and of photo_image_types.key. Adding
-- `receiving_shipping_label`, `receiving_box_front`, … would fan that matrix out
-- by six and silently change what every existing filter, gallery and gate counts.
--
-- Aspect answers a different question — *what does this shot show* — and refines
-- WITHIN a type, so the two axes stay orthogonal:
--
--     stage  (from photo_type) = which evidentiary moment
--     aspect (this column)     = which shot of that moment
--
-- The guided Unbox procedure needs exactly this: three of its steps (shipping
-- label · the box · packing material) are all `unbox_carton` stage evidence and
-- are told apart by aspect alone. Gating them on the stage count would let one
-- photo satisfy all three.
--
-- VOCABULARY SoT: src/lib/photos/photo-aspects.ts (PHOTO_ASPECTS). The CHECK
-- list below and that TS union are asserted identical by
-- src/lib/photos/photo-aspect-vocabulary.guard.test.ts — extend BOTH in one
-- change or that guard fails CI.
--
-- NO BACKFILL — deliberate. Every existing row is genuinely unclassified, and
-- inferring an aspect from photo_type would manufacture an evidence claim that
-- no operator ever made. NULL is legal and means *unclassified evidence*, never
-- *missing evidence*: the procedure receipt reports "3 photos" for such a
-- carton, not "step incomplete".
--
-- SAFETY GATING: additive, nullable, no default. Every existing writer omits the
-- column and keeps working unchanged; `photos` already carries organization_id
-- with FORCE RLS (2026-06-14 infra), so an ALTER needs no enforce call.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_photos_org_aspect;
--   ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_photo_aspect_chk;
--   ALTER TABLE photos DROP COLUMN IF EXISTS photo_aspect;
--
-- VERIFY:
--   \d+ photos                         -- photo_aspect text, nullable, no default
--   SELECT COUNT(*) FROM photos WHERE photo_aspect IS NOT NULL;   -- 0 after apply
-- ============================================================================

BEGIN;

ALTER TABLE photos ADD COLUMN IF NOT EXISTS photo_aspect TEXT;

DO $$ BEGIN
  ALTER TABLE photos ADD CONSTRAINT photos_photo_aspect_chk
    CHECK (photo_aspect IS NULL OR photo_aspect IN (
      'shipping_label',
      'box_exterior',
      'box_interior',
      'packing_material',
      'included',
      'serial',
      'front',
      'back',
      'side',
      'bottom'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The only query shape is "does THIS carton / line have >=1 shot of aspect X",
-- always org-scoped. Partial on NOT NULL because every pre-existing row is NULL
-- and would otherwise sit in an index nothing queries.
CREATE INDEX IF NOT EXISTS idx_photos_org_aspect
  ON photos (organization_id, photo_aspect)
  WHERE photo_aspect IS NOT NULL;

COMMENT ON COLUMN photos.photo_aspect IS
  'What this shot shows, WITHIN its stage (src/lib/photos/photo-aspects.ts). NULL = unclassified evidence, never missing evidence. Orthogonal to photo_type, which encodes entity legality.';

COMMIT;
