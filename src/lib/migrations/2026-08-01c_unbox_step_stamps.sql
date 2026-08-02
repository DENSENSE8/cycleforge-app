-- ============================================================================
-- 2026-08-01c_unbox_step_stamps.sql
--
-- Unbox guided procedure — the two acts the schema could not see.
--
-- The guided procedure derives every step's completion from the carton's own
-- facts; nothing is ticked by hand (the org-editable checklist_templates list
-- was deleted 2026-08-01 precisely because a box got ticked when someone
-- remembered to tick it). Two steps had no fact to derive from:
--
--   CONDITION — receiving_line_testing.condition_grade is NOT NULL with a
--     default, so "an operator graded this unit" and "nobody has touched this
--     carton" are indistinguishable. The GRADE can therefore never be the gate.
--     condition_graded_at records the ACT. (condition_set_at already exists but
--     is a different thing: it is the set-ONCE first-explicit-set stamp the
--     condition route COALESCEs, so it cannot be cleared by a reopen and cannot
--     answer "is this step currently satisfied".)
--
--   CONTENTS — nothing at all recorded that a human read the line list before
--     working the box. contents_confirmed_at is that fact.
--
-- Both columns do double duty: they are the step's gate AND the receipt's
-- timestamp (src/lib/receiving/procedure-receipt.ts).
--
-- GRAIN. condition is a LINE fact → receiving_line_testing (the existing
-- condition home). contents is a CARTON fact → receiving_unbox. Neither is
-- hoisted to the other: a per-line grade on the carton, or a carton-level
-- contents flag on each line, is the note/label grain mistake in a new shape
-- (.claude/rules/source-of-truth.md → Note vs label grain).
--
-- NO BACKFILL — deliberate, and the more important half of this file. A stamp
-- asserts that a PERSON did something at a TIME. Backfilling
-- condition_graded_at := updated_at would assert an act that may never have
-- happened — exactly the falsifiable tick the derived procedure exists to
-- prevent. Pre-existing cartons read those two steps as pending, which is the
-- honest answer, and each is one tap or one scan away.
--
-- REOPEN. Both writers support setting the column back to NULL. That is what
-- makes the receipt's "open again to edit" bar honest: it retracts the claim
-- rather than hiding it, and audit_logs keeps both events.
--
-- SAFETY GATING: additive, nullable, no defaults; every existing writer omits
-- these columns. Both tables already carry organization_id with FORCE RLS, so
-- an ALTER needs no enforce call.
--
-- ROLLBACK:
--   ALTER TABLE receiving_line_testing
--     DROP COLUMN IF EXISTS condition_graded_at,
--     DROP COLUMN IF EXISTS condition_graded_by;
--   ALTER TABLE receiving_unbox
--     DROP COLUMN IF EXISTS contents_confirmed_at,
--     DROP COLUMN IF EXISTS contents_confirmed_by;
--
-- VERIFY:
--   \d+ receiving_line_testing   -- condition_graded_at timestamptz NULL
--   \d+ receiving_unbox          -- contents_confirmed_at timestamptz NULL
--   SELECT COUNT(*) FROM receiving_line_testing WHERE condition_graded_at IS NOT NULL; -- 0
-- ============================================================================

BEGIN;

ALTER TABLE receiving_line_testing
  ADD COLUMN IF NOT EXISTS condition_graded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS condition_graded_by INTEGER REFERENCES staff(id) ON DELETE SET NULL;

ALTER TABLE receiving_unbox
  ADD COLUMN IF NOT EXISTS contents_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contents_confirmed_by INTEGER REFERENCES staff(id) ON DELETE SET NULL;

COMMENT ON COLUMN receiving_line_testing.condition_graded_at IS
  'When an operator explicitly graded this line, cleared by a reopen. The gate for the Condition procedure step — condition_grade is NOT NULL with a default and can never be one. Distinct from condition_set_at, which is the COALESCE-once first-set stamp.';
COMMENT ON COLUMN receiving_unbox.contents_confirmed_at IS
  'When an operator confirmed the carton contents against the line list, cleared by a reopen. The gate for the Contents procedure step. Never backfilled.';

COMMIT;
