-- 2026-09-26_perf_10_staff_inbox_items_feed_last.sql
--
-- WHAT
--   CREATE INDEX idx_staff_inbox_items_feed_last
--     ON staff_inbox_items (organization_id, staff_id, last_event_at DESC, id DESC)
--     WHERE state IN ('unread','read','snoozed');
--
-- WHY
--   getInboxFeed (src/lib/notifications/inbox.ts:54-83, /api/inbox, polled)
--   orders by `i.last_event_at DESC, i.id DESC`, but the existing
--   idx_staff_inbox_items_feed keys on (state, occurred_at), so it can serve
--   neither the sort nor the 'active' filter (an OR over three states). Measured
--   (docs/refactors/sidebar/perf-explain/staff_inbox_items_feed.before.txt):
--   Seq Scan + Sort, 0.26 ms at 21 rows. The win is negligible today; this is
--   the ordering index for when 'done' history accumulates per staffer.
--   The partial predicate is the whole non-'done' vocabulary of
--   staff_inbox_items_state_chk ('unread','read','done','snoozed'). Every
--   filter except 'done' implies it: 'active' folds to
--   `state IN ('unread','read') OR (state = 'snoozed' AND …)`, and 'unread' /
--   'snoozed' are single equalities. org (uuid =) and staff_id (int =) are
--   leakproof index conditions under RLS; entity_type = ANY(...) and the state
--   test stay as Filters on an already-ordered walk that stops at LIMIT.
--
-- SAFETY
--   Plain CREATE INDEX (runner-wrapped transaction, no CONCURRENTLY). 21 rows.
--   No code change required.
--
-- VERIFY
--   Run docs/refactors/sidebar/perf-explain/staff_inbox_items_feed.after.sql as
--   app_tenant. At 21 rows the planner may still prefer a Seq Scan; confirm with
--   the index listed in \d staff_inbox_items and re-check after growth/ANALYZE.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_staff_inbox_items_feed_last;

CREATE INDEX IF NOT EXISTS idx_staff_inbox_items_feed_last
  ON staff_inbox_items (organization_id, staff_id, last_event_at DESC, id DESC)
  WHERE state IN ('unread', 'read', 'snoozed');
