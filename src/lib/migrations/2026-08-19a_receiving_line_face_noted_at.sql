-- 2026-08-19a_receiving_line_face_noted_at.sql
--
-- WHEN was this line's sticker face last WRITTEN.
--
-- Unbox notes-composer **Recent** repeats the phrase the bench just put on a
-- sticker. It ranked candidates by the CARTON's scan time, because that was the
-- only clock available — so a note typed today on a carton scanned last week
-- lost to a week-old note on a carton scanned yesterday, and an operator who
-- works cartons out of Recent / Queue (rather than scanning each one in) could
-- never see their own latest phrase.
--
-- `receiving_line.updated_at` is NOT that clock: it bumps on every patch the
-- line takes (condition, serial, qty, verdict), so ranking on it resurfaces an
-- ancient sentence the moment someone grades an old carton. This column moves
-- ONLY when `notes` or `label_note` actually changes value.
--
-- NO BACKFILL, deliberately. There is no honest historical value to write —
-- `updated_at` would be a guess, and a guess here puts a wrong phrase on a real
-- sticker. Legacy rows stay NULL and keep ranking by their carton's scan time
-- (`COALESCE(face_noted_at, scanned_at)` in recent-label-note-server.ts), so
-- behaviour is unchanged for them and exact for every note written from now on.
--
-- Writer: PATCH /api/receiving-lines (the one door the notes composer, the
-- label editor and the carton-print stamp all go through).
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_receiving_line_face_noted_at;
--   ALTER TABLE receiving_line DROP COLUMN IF EXISTS face_noted_at;

BEGIN;

ALTER TABLE receiving_line
  ADD COLUMN IF NOT EXISTS face_noted_at timestamptz;

COMMENT ON COLUMN receiving_line.face_noted_at IS
  'When notes/label_note (the sticker face text) last CHANGED. Null on rows written before 2026-08-19; never backfilled. Ranks Unbox notes-composer Recent.';

-- Recent reads the newest few faces per org and nothing else, so the index is
-- partial: only stamped rows are ever ordered by this column.
CREATE INDEX IF NOT EXISTS idx_receiving_line_face_noted_at
  ON receiving_line (organization_id, face_noted_at DESC)
  WHERE face_noted_at IS NOT NULL;

COMMIT;
