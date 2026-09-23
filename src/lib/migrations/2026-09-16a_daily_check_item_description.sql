-- 2026-09-16a_daily_check_item_description.sql
--
-- Daily item context belongs to `daily_check_items`, never to a single
-- `daily_check_marks` attestation. A null description remains the honest shape
-- for existing items and blank captures.
--
-- ROLLBACK:
--   ALTER TABLE daily_check_items
--     DROP CONSTRAINT IF EXISTS daily_check_items_description_len,
--     DROP COLUMN IF EXISTS description;
--
-- VERIFY:
--   \d+ daily_check_items

BEGIN;

ALTER TABLE daily_check_items
  ADD COLUMN IF NOT EXISTS description TEXT;

DO $$ BEGIN
  ALTER TABLE daily_check_items
    ADD CONSTRAINT daily_check_items_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN daily_check_items.description IS
  'Optional task context (at most 2000 characters). It is item-level, not a note on one daily check mark.';

COMMIT;
