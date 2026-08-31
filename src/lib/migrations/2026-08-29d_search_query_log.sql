-- ============================================================================
-- 2026-08-29d — search_query_log (what operators looked for, and what they got)
--
-- WHAT
--   One row per executed search: the string, the axis it ran on, how many hits
--   came back, whether the engine had to relax the query to find them, and —
--   stamped later by the result click — which record actually answered it.
--
-- WHY
--   Search quality was, until now, unmeasurable here. Nothing recorded what was
--   typed, what returned nothing, or where an operator gave up, so every
--   relevance change was a guess and no change could be proven to have helped.
--   The industry practice this table exists to enable is the zero-result
--   worklist: the recurring queries that find nothing are the synonym table's
--   backlog and the clearest signal of a coverage gap. `search_recents` cannot
--   serve this — it is an MRU of successful opens, deliberately collapsed to one
--   row per record, so the misses (the interesting half) are exactly what it
--   throws away.
--
-- WHY THE RAW STRING AND A NORMALIZED ONE
--   `query` is kept verbatim because the failure is often IN the typing — a
--   scanner prefix, a pasted newline, a trailing tab. `normalized_query` is the
--   grouping key (case-folded, whitespace-collapsed) so "Dell 7400" and
--   "dell  7400" aggregate into one worklist entry instead of two.
--
-- PII POSTURE
--   A query is operator-typed free text and CAN contain a customer name, email
--   or phone — the buyer-identity search this migration's sibling work enables
--   makes that likely, not hypothetical. So: org-scoped from birth like every
--   other table here, and `staff_id` is ON DELETE SET NULL so removing a person
--   does not have to mean losing the aggregate. Retention is deliberately NOT
--   enforced in DDL — a pruning job belongs with the other cron work, and a
--   silent DDL-level TTL would be a surprise to whoever later needs the history.
--
-- OPENED_* IS NULLABLE ON PURPOSE
--   The click is a second, later write from the client beacon. A row that never
--   gets one is not an error — it is the abandonment signal, and it is the most
--   valuable row in the table. Do not backfill it, and do not read NULL as
--   "unknown"; read it as "nothing here answered them".
--
-- EXPAND-ONLY
--   New table, no writers at apply time. Safe to FORCE RLS now, per the
--   expand → code → contract ordering law: this lands before the route that
--   writes it.
--
-- ROLLBACK (dev only)
--   SELECT relax_tenant_isolation('search_query_log');
--   DROP TABLE IF EXISTS search_query_log CASCADE;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS search_query_log (
  id                 BIGSERIAL PRIMARY KEY,
  organization_id    UUID NOT NULL,   -- no DDL default; enforce_tenant_isolation installs the loud-fail GUC default
  staff_id           INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  -- Verbatim, including whatever whitespace or scanner noise arrived with it.
  query              TEXT NOT NULL,
  -- Case-folded + whitespace-collapsed grouping key. Built by
  -- normalizeQuery() in src/lib/search/query-expansion.ts — the one SoT, so
  -- the worklist groups the same way the engine matches.
  normalized_query   TEXT NOT NULL,
  -- A SearchByScope ('internal' | 'order' | 'tracking' | 'serial' | 'ticket')
  -- or NULL for an unscoped fan-out. No CHECK: the scope list is owned by
  -- src/lib/search/search-by.ts and a DDL copy would drift behind it.
  axis               TEXT,
  -- Which surface issued it: 'palette' (⌘K) or 'search-page'. Kept because the
  -- two have different affordances and their zero-result rates are not
  -- comparable to each other.
  surface            TEXT,
  result_count       INTEGER NOT NULL,
  -- TRUE when the first pass found nothing and a relaxed retry produced these
  -- rows. A relaxed hit is a near-miss, not a clean hit, and the worklist wants
  -- to see it as such.
  relaxed            BOOLEAN NOT NULL DEFAULT FALSE,
  -- TRUE when the vector arm contributed. Currently always FALSE org-wide
  -- (entity_search_docs holds 0 embeddings); this column is how anyone will
  -- notice when that stops being true.
  used_semantic      BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms         INTEGER,
  -- Stamped by the click beacon, not the search. NULL = the operator opened
  -- nothing. See the header — that is a signal, not a gap.
  opened_entity_type TEXT,
  opened_entity_id   BIGINT,
  opened_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Read shape 1: "what has this org been searching lately" — the activity feed
-- and the latency percentiles.
CREATE INDEX IF NOT EXISTS idx_search_query_log_org_recent
  ON search_query_log (organization_id, created_at DESC);

-- Read shape 2: THE zero-result worklist. Partial, so it indexes only the
-- misses — a few percent of rows — and stays small enough to stay hot.
CREATE INDEX IF NOT EXISTS idx_search_query_log_zero_result
  ON search_query_log (organization_id, normalized_query)
  WHERE result_count = 0;

-- Read shape 3: the click beacon's target. It updates the most recent
-- unopened row for (org, staff, normalized_query), so that lookup needs to be
-- a direct index hit rather than a scan of the org's recent history.
CREATE INDEX IF NOT EXISTS idx_search_query_log_open_target
  ON search_query_log (organization_id, staff_id, normalized_query, created_at DESC)
  WHERE opened_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('search_query_log');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — search_query_log left without FORCE RLS';
  END IF;
END $$;

COMMENT ON TABLE search_query_log IS
  'One row per executed search: string, axis, result count, relaxation, latency, and the record the operator opened (NULL = opened nothing, i.e. abandonment). Feeds the zero-result worklist that drives synonym curation. Written by src/lib/search/query-log.ts.';

COMMIT;
