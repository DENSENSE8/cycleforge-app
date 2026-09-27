-- 2026-09-26_perf_09_entity_search_docs_null_embedding.sql
--
-- WHAT
--   CREATE INDEX idx_entity_search_docs_null_embedding
--     ON entity_search_docs (organization_id, updated_at)
--     WHERE embedding IS NULL;
--
-- WHY
--   The embedding retry sweep (src/lib/search/search-outbox-worker.ts:510-540)
--   runs two reads over NULL-embedding docs:
--     listOrgsWithNullEmbeddings: WHERE embedding IS NULL AND updated_at < now() - $1 min
--                                 GROUP BY organization_id
--     enqueueNullEmbeddingDocs:   WHERE organization_id = $1 AND embedding IS NULL
--                                 AND updated_at < now() - $3 min
--                                 ORDER BY updated_at ASC LIMIT $2
--   Nothing indexes embedding IS NULL or (organization_id, updated_at), so both
--   seq-scan the table and the second top-N sorts it. Measured
--   (docs/refactors/sidebar/perf-explain/entity_search_docs_null_embedding.before.txt):
--   Seq Scan over 11,732 rows + top-N heapsort, 6.1 ms as app_tenant, 5.1 ms as
--   the owner pool the sweep uses.
--   With this index the per-org sweep walks (organization_id, updated_at) in
--   order and stops at LIMIT, and the org list becomes an index-only scan of the
--   partial. Today every doc has a NULL embedding, so the partial is
--   table-sized; it shrinks to the retry backlog once embeddings land.
--
-- SAFETY
--   Plain CREATE INDEX (runner-wrapped transaction, no CONCURRENTLY). ~12.5k
--   rows; sub-second SHARE lock. No code change required.
--
-- VERIFY
--   Run docs/refactors/sidebar/perf-explain/entity_search_docs_null_embedding.after.sql:
--   expect Index Scan using idx_entity_search_docs_null_embedding, no Sort.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_entity_search_docs_null_embedding;

CREATE INDEX IF NOT EXISTS idx_entity_search_docs_null_embedding
  ON entity_search_docs (organization_id, updated_at)
  WHERE embedding IS NULL;
