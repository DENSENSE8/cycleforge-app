-- 2026-08-19c_daily_check_window_bound.sql
--
-- Fix: an item added and removed on the SAME day threw 23514.
--
-- 2026-08-19b shipped `CHECK (retired_at IS NULL OR retired_at > effective_from)`,
-- which reads as "a window must span at least one day". It does not: the window
-- is HALF-OPEN — an item is in effect on day D when
--   effective_from <= D AND (retired_at IS NULL OR retired_at > D)
-- so `retired_at = effective_from` is a well-formed EMPTY window, meaning the
-- item was never in effect on any day. That is precisely what happens when an
-- admin adds a check, sees the typo, and removes it before the shift ends —
-- an ordinary flow, and the only one the UI even offers (Remove renders on
-- today only). The old bound made it a 500.
--
-- `>=` still rejects the case the constraint exists for: a window that CLOSES
-- BEFORE it opens, which would drop the item out of every report silently
-- instead of failing loudly.
--
-- Consequence, and it is the wanted one: a same-day add+remove leaves the item
-- in effect on no day, so any ticks recorded against it in that window stop
-- counting — `buildDailyCheckReport` already drops marks for items not in
-- effect, so a retired check can never render the report as "7 of 6".
--
-- Found by an end-to-end probe against the live schema, not by typecheck: the
-- bound is a database predicate, so no amount of TypeScript could have reached
-- it. 2026-08-19b is already applied and its filename is immutable (the ledger
-- is keyed (filename, sha256)), so this lands as its own slot rather than an
-- edit.
--
-- ROLLBACK:
--   ALTER TABLE daily_check_items DROP CONSTRAINT IF EXISTS daily_check_items_window_chk;
--   ALTER TABLE daily_check_items ADD CONSTRAINT daily_check_items_window_chk
--     CHECK (retired_at IS NULL OR retired_at > effective_from);
--
-- VERIFY:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'daily_check_items'::regclass and conname like '%window%';

BEGIN;

ALTER TABLE daily_check_items
  DROP CONSTRAINT IF EXISTS daily_check_items_window_chk;

-- Redefined with the FULL predicate, never appended to (backend-patterns.md).
ALTER TABLE daily_check_items
  ADD CONSTRAINT daily_check_items_window_chk
  CHECK (retired_at IS NULL OR retired_at >= effective_from);

COMMENT ON COLUMN daily_check_items.retired_at IS
  'Civil day the item left the list, EXCLUSIVE. Equal to effective_from = added and removed the same day = in effect on no day. NULL = still live.';

COMMIT;
