-- ============================================================================
-- 2026-10-05_serial_units_refurb_provenance.sql
--
-- WHAT: serial_units.refurb_provenance — who restored this physical unit, if
-- anyone: NONE | MANUFACTURER | SELLER | AMAZON_RENEWED.
--
-- WHY: prepack used to fold "refurbished" into condition_grade. Condition is
-- the PHYSICAL state of the unit in hand; refurbishment provenance is a
-- listing-program / history attribute. A unit can be physically Used A and
-- still be Amazon Renewed, so the two axes live in separate columns.
-- Vocabulary SoT: src/lib/prepack/types.ts (PREPACK_PROVENANCES) — extend the
-- CHECK below and that tuple in one change.
--
-- NO BACKFILL — deliberate. NULL means "not yet recorded"; inferring NONE for
-- existing units would manufacture a claim no operator made. Prepack Finish is
-- the writer and always records a value.
--
-- SAFETY: additive, nullable, no default; existing writers omit the column and
-- keep working. serial_units already carries organization_id with FORCE RLS.
-- CHECK is added guarded (duplicate_object) so a re-run is a no-op.
--
-- ROLLBACK:
--   ALTER TABLE serial_units DROP CONSTRAINT IF EXISTS serial_units_refurb_provenance_chk;
--   ALTER TABLE serial_units DROP COLUMN IF EXISTS refurb_provenance;
--
-- VERIFY:
--   \d+ serial_units                    -- refurb_provenance text, nullable
--   SELECT COUNT(*) FROM serial_units WHERE refurb_provenance IS NOT NULL;  -- 0 after apply
-- ============================================================================

BEGIN;

ALTER TABLE serial_units ADD COLUMN IF NOT EXISTS refurb_provenance TEXT;

DO $$ BEGIN
  ALTER TABLE serial_units ADD CONSTRAINT serial_units_refurb_provenance_chk
    CHECK (refurb_provenance IS NULL OR refurb_provenance IN (
      'NONE',
      'MANUFACTURER',
      'SELLER',
      'AMAZON_RENEWED'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN serial_units.refurb_provenance IS
  'Who restored this unit (NONE|MANUFACTURER|SELLER|AMAZON_RENEWED); NULL = not yet recorded. A listing-program / history attribute, never a physical condition — physical state lives in condition_grade. Written by prepack Finish.';

COMMIT;
