-- ============================================================================
-- 2026-10-05_fba_fnskus_label_mark.sql
--
-- WHAT: fba_fnskus.label_mark — the bottom-right corner of the FNSKU sticker
-- (a color, a series, or whatever the operator types).
--
-- WHY: the color and the series number are buried in the product title and
-- get cut off when the title wraps. The label reads them out automatically.
-- An operator must be able to correct that corner from Print station › Label
-- details, and silent printing on another computer has to use the same words.
--
-- NO BACKFILL. NULL/'' = read the corner from the title. Existing writers
-- omit the column.
--
-- SAFETY: additive, nullable, no default. fba_fnskus already carries
-- organization_id. No new key, no RLS change.
--
-- ROLLBACK:
--   ALTER TABLE fba_fnskus DROP COLUMN IF EXISTS label_mark;
--
-- VERIFY:
--   SELECT label_mark FROM fba_fnskus LIMIT 1;
-- ============================================================================

BEGIN;

ALTER TABLE fba_fnskus ADD COLUMN IF NOT EXISTS label_mark TEXT;

COMMENT ON COLUMN fba_fnskus.label_mark IS
  'Bottom-right of the FNSKU label. NULL = color or series read from product_title.';

COMMIT;
