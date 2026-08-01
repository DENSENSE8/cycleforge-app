-- ============================================================================
-- 2026-07-31b_receiving_lines_label_note.sql
--
-- Lane C — LABEL/NOTE GRAIN split. `receiving_line.notes` is dual-purpose: it
-- is the operator's durable per-item note AND the text printed in the center
-- slot of the carton label face (receivingPayloadToFace → LabelFaceModel.center,
-- and the As Listed disclosure). One buffer for two jobs means an operator
-- cannot write an item note that does not print, and cannot re-word a label
-- without rewriting the record's note.
--
-- Split the PRINTED text into its own column. This mirrors
-- 2026-06-24_receiving_lines_zoho_notes.sql, which split the Zoho-imported
-- description out for the same reason and left `notes` operator-owned:
--
--   receiving_line.notes       = operator's durable item note (never printed)
--   receiving_line.label_note  = the printed label face center text
--   receiving_line.zoho_notes  = Zoho line description (read-only import)
--
-- TABLE NAME: the physical spine table is `receiving_line` (SINGULAR) since the
-- 2026-07-05d rename; the `receiving_lines` compat view was dropped by
-- 2026-07-11_receiving_drop_compat_views.sql. Do not target the plural name —
-- it no longer exists. (The 2026-06-24 file above predates the rename.)
--
-- BACKFILL — unlike the 2026-06-24 split, a backfill IS correct here and is
-- REQUIRED. Today's `notes` is verbatim what the face prints, so copying it
-- into `label_note` makes every existing carton REPRINT AN IDENTICAL FACE.
-- Skipping the backfill would silently blank the center slot on every carton
-- with printed history. Only non-blank notes are copied so a NULL/'' note does
-- not manufacture an empty-string face.
--
-- After this runs the two columns start equal and diverge from the next edit:
-- the notes composer writes `notes`, the label editor writes `label_note`.
--
-- ADDITIVE + nullable. receiving_line is org-scoped + FORCEd already
-- (2026-06-19); this column inherits the row's tenant, so no new policy.
-- ROLLBACK: ALTER TABLE receiving_line DROP COLUMN IF EXISTS label_note;
--
-- Verify after apply:
--   SELECT COUNT(*) FROM receiving_line WHERE label_note IS DISTINCT FROM notes
--     AND btrim(COALESCE(notes,'')) <> '';   -- 0 rows immediately after backfill
-- ============================================================================

BEGIN;

ALTER TABLE receiving_line ADD COLUMN IF NOT EXISTS label_note text;

COMMENT ON COLUMN receiving_line.label_note IS
  'Printed label face center text for this line (LabelFaceModel.center via receivingPayloadToFace, and the As Listed disclosure). Split out of receiving_line.notes 2026-07-31 so `notes` is an operator item note that never prints. Written by the label editor (LabelEditPopover / As Listed); backfilled from notes so pre-split cartons reprint an identical face.';

-- Preserve printed history: seed the face from what it prints today. Guarded so
-- a re-run never clobbers a face the operator has since edited away from notes.
UPDATE receiving_line
   SET label_note = notes
 WHERE label_note IS NULL
   AND notes IS NOT NULL
   AND btrim(notes) <> '';

COMMIT;
