-- 2026-09-26_perf_08_entity_search_outbox_stale_claim.sql
--
-- WHAT
--   CREATE INDEX idx_entity_search_outbox_stale_claim
--     ON entity_search_outbox (claimed_at)
--     WHERE processed_at IS NULL AND claimed_at IS NOT NULL;
--
-- WHY
--   Every outbox drain first releases crashed claims
--   (src/lib/search/search-outbox-worker.ts:343-348):
--     UPDATE entity_search_outbox SET claimed_at = NULL
--      WHERE processed_at IS NULL AND claimed_at < now() - INTERVAL '15 minutes'
--   No index covers claimed rows (idx_entity_search_outbox_pending and
--   ux_entity_search_outbox_pending are both `claimed_at IS NULL` partials), so
--   it seq-scans the whole outbox, processed history included. Measured
--   (docs/refactors/sidebar/perf-explain/entity_search_outbox_stale_claim.before.txt):
--   Seq Scan, Rows Removed by Filter: 9,475, 1.17 ms as app_tenant, 2.08 ms as
--   the owner pool the worker actually uses; the scan grows with every
--   processed row while the set it looks for is normally empty.
--   The partial predicate is implied by the query (`claimed_at < x` is strict,
--   so it implies `claimed_at IS NOT NULL`), which keeps the index at
--   in-flight size only.
--
-- SAFETY
--   Plain CREATE INDEX (runner-wrapped transaction, no CONCURRENTLY). ~9.5k
--   rows, currently 0 matching; sub-second SHARE lock. No code change required.
--
-- VERIFY
--   Run docs/refactors/sidebar/perf-explain/entity_search_outbox_stale_claim.after.sql:
--   expect a scan of idx_entity_search_outbox_stale_claim instead of Seq Scan.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_entity_search_outbox_stale_claim;

CREATE INDEX IF NOT EXISTS idx_entity_search_outbox_stale_claim
  ON entity_search_outbox (claimed_at)
  WHERE processed_at IS NULL AND claimed_at IS NOT NULL;
