-- 2026-09-26_perf_07_feed_memberships_open_rail.sql
--
-- WHAT
--   CREATE INDEX idx_feed_memberships_open
--     ON feed_memberships (organization_id, feed_key, occurred_at DESC, id DESC)
--     WHERE state <> 'done';
--
-- WHY
--   getFeedState (src/lib/assistant/tools/read-tools.ts:227-240) reads the open
--   rail as
--     WHERE m.organization_id = $1 AND m.feed_key = $2 AND m.state <> 'done'
--     ORDER BY m.occurred_at DESC LIMIT $3
--   The only feed index, idx_feed_memberships_org_feed_state_time
--   (organization_id, feed_key, state, occurred_at DESC, id DESC), cannot serve
--   `state <> 'done'` (an inequality on the third key breaks the ordered walk),
--   so the planner seq-scans. Measured as app_tenant
--   (docs/refactors/sidebar/perf-explain/feed_memberships_open_rail.before.txt):
--   Seq Scan on feed_memberships, Rows Removed by Filter: 2,533, then a top-N
--   sort; 0.67 ms today. 'done' rows are ~67% of the table and only accumulate,
--   so the scan grows with history while the open set stays small.
--   The partial predicate is the query's own `state <> 'done'` literal (textne
--   is leakproof, so it holds under forced RLS too); org + feed_key are plain
--   text/uuid equality index conditions; occurred_at DESC serves the ORDER BY.
--
-- SAFETY
--   Plain CREATE INDEX (runner-wrapped transaction, no CONCURRENTLY). ~2.7k
--   rows; sub-second SHARE lock. No code change required.
--   The now-unused idx_feed_memberships_org_feed_state_time is dropped in a
--   later file (2026-09-26_perf_11_drop_feed_memberships_org_feed_state_time.sql).
--
-- VERIFY
--   Run docs/refactors/sidebar/perf-explain/feed_memberships_open_rail.after.sql
--   as app_tenant: expect Index Scan using idx_feed_memberships_open, no Seq Scan.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_feed_memberships_open;

CREATE INDEX IF NOT EXISTS idx_feed_memberships_open
  ON feed_memberships (organization_id, feed_key, occurred_at DESC, id DESC)
  WHERE state <> 'done';
