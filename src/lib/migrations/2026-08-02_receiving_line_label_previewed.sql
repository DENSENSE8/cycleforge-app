-- ============================================================================
-- 2026-08-02_receiving_line_label_previewed.sql
--
-- Unbox guided procedure — the LABEL step's fact.
--
-- The printed face moved into the procedure column as its own capture step
-- (`label`), replacing the standalone preview that used to sit beneath the
-- column and slide under the composer dock. Every capture step needs a gate,
-- every gate needs a fact the carton already carries, and this step had none.
--
-- WHY NOT ONE OF THE COLUMNS THAT ALREADY EXIST:
--
--   receiving_line.label_note — the printed face's centre text. Null on most
--     cartons, because the default face is usually correct. Gating on it would
--     mean "the operator never dealt with the label" on every carton whose face
--     needed no edit, and would park the procedure pointer on the last step
--     forever. It answers "was the face customised", not "did a person read it".
--
--   receiving_line_testing.label_printed_at — the COMMIT act, owned by the
--     terminal dock (`phase: 'commit'` in stations/procedure.ts). Gating a
--     CAPTURE step on it inverts the phase order: the capture slice would only
--     settle after the act that closes the carton out.
--
-- So: a fact of its own. `label_previewed_at` records that a person looked at
-- the face this carton is about to print and said it was right — the same shape
-- and the same justification as `receiving_unbox.contents_confirmed_at`
-- (2026-08-01c), which records that a human read the line list. Both are the one
-- kind of thing only a person can attest, and both are the step's gate AND the
-- receipt's timestamp (src/lib/receiving/procedure-receipt.ts).
--
-- This is NOT the hand-ticked checklist that was deleted 2026-08-01. That list
-- let an operator tick "photographed the packing material" — a claim about
-- EVIDENCE, which the carton itself can answer and therefore must. Reading a
-- label leaves no evidence behind; the acknowledgement is the only fact there
-- is, and its column name says exactly that and nothing more.
--
-- GRAIN. A label is printed FROM A LINE (a multi-line PO prints one face per
-- line — .claude/rules/source-of-truth.md → Note vs label grain), so this is a
-- line fact and lands beside label_printed_at on receiving_line_testing. It is
-- never hoisted to receiving_carton.
--
-- NO BACKFILL — deliberate, same as 2026-08-01c. A stamp asserts that a PERSON
-- did something at a TIME. Pre-existing cartons read the label step as pending,
-- which is the honest answer and is one tap away.
--
-- REOPEN. The writer supports setting the column back to NULL, so retracting
-- the claim is possible and leaves audit_logs as the record of both events.
--
-- SAFETY GATING: additive, nullable, no defaults; every existing writer omits
-- these columns. receiving_line_testing already carries organization_id with
-- FORCE RLS, so an ALTER needs no enforce call.
--
-- ROLLBACK:
--   ALTER TABLE receiving_line_testing
--     DROP COLUMN IF EXISTS label_previewed_at,
--     DROP COLUMN IF EXISTS label_previewed_by;
--
-- VERIFY:
--   \d+ receiving_line_testing  -- label_previewed_at timestamptz NULL
--   SELECT COUNT(*) FROM receiving_line_testing WHERE label_previewed_at IS NOT NULL; -- 0
-- ============================================================================

BEGIN;

ALTER TABLE receiving_line_testing
  ADD COLUMN IF NOT EXISTS label_previewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS label_previewed_by INTEGER REFERENCES staff(id) ON DELETE SET NULL;

COMMENT ON COLUMN receiving_line_testing.label_previewed_at IS
  'When an operator confirmed they read this line''s printed label face, cleared by a reopen. The gate for the Label procedure step. Distinct from label_printed_at, which is the commit act the terminal dock owns. Never backfilled.';

COMMIT;
