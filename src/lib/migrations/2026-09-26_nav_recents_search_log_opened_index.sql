-- ============================================================================
-- search_query_log — index the per-staff "opened from search" read
--   (contextual sidebar recents surface `identify.opened`,
--    src/lib/nav/recents/adapters.ts IDENTIFIED_RECENTS_SQL)
--
-- WHAT / WHY
--   The `identify.opened` recents list reads a staffer's newest opened records:
--     WHERE organization_id = $1 AND staff_id = $2 AND opened_at IS NOT NULL
--     ORDER BY … opened_at DESC
--   None of the existing indexes serves it (org_recent is org-wide by
--   created_at; open_target is partial on opened_at IS NULL — the complement).
--   Every key column is a plain uuid/int/timestamptz and the partial predicate
--   is a NullTest, so it stays an Index Cond under forced RLS as app_tenant.
--
-- SAFETY
--   Additive index only; no data change. The table is small (hundreds of rows
--   on the dev branch), so a plain CREATE INDEX (not CONCURRENTLY) holds its
--   SHARE lock for milliseconds and can run inside the runner's transaction.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_search_query_log_staff_opened;
--
-- VERIFY (after /db-migrate)
--   \d search_query_log
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_search_query_log_staff_opened
  ON search_query_log (organization_id, staff_id, opened_at DESC)
  WHERE opened_at IS NOT NULL;
