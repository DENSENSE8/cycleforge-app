-- 2026-09-16b_daily_check_once_owner.sql
--
-- A staff assignment narrows a one-off only. Recurring items are always owed
-- by the whole shift. The constraint is NOT VALID deliberately: older rows can
-- retain an obsolete owner without rewriting historical records, while every
-- new or changed row is checked immediately. The read model ignores such stale
-- recurring owners.
--
-- ROLLBACK:
--   ALTER TABLE daily_check_items
--     DROP CONSTRAINT IF EXISTS daily_check_items_once_owner_chk;
--
-- VERIFY:
--   SELECT conname, convalidated, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'daily_check_items'::regclass
--      AND conname = 'daily_check_items_once_owner_chk';

BEGIN;

DO $$ BEGIN
  ALTER TABLE daily_check_items
    ADD CONSTRAINT daily_check_items_once_owner_chk
    CHECK (kind = 'once' OR assigned_staff_id IS NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON CONSTRAINT daily_check_items_once_owner_chk ON daily_check_items IS
  'Only one-off Daily items may be assigned to one staff member; recurring work is shift-wide.';

COMMIT;
