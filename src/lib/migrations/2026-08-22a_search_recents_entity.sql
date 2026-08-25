-- ============================================================================
-- search_recents — the recent remembers WHICH RECORD it opened
--   (docs/todo/search-recent-rail-teardown-HANDOFF.md §3.2)
--
-- WHAT / WHY
--   The `/search` rail could not paint a product title because the table holds
--   no reference to the record a search opened — only `scope_href` / `top_hit`,
--   two URL strings. Recovering an entity from those meant running
--   URLSearchParams over a persisted route, which fails twice over:
--
--     • only ORDER hrefs are `?sel=type:id`-shaped. `searchHitHref`
--       (src/lib/search/search-hit.ts) sends RECEIVING to `/carton/{id}`,
--       SERIAL_UNIT to `?unit=`, SKU to `?skuId=` — none parseable as a
--       selection, so those recents resolved to nothing at all.
--     • a stored route snapshot is hostage to the current shape of the route.
--       Change a path and every historical row silently stops opening
--       anything: no error, just a dead row.
--
--   These two columns are the durable fact. `?sel=` is BUILT from them, and the
--   rail feed resolves them against `entity_search_docs` — the display cache
--   that already holds the title, subtitle, status and grade a row paints — so
--   a "recently searched" row is a real record, in the same shape and with the
--   same anatomy as an Unbox carton row.
--
-- VOCABULARY
--   `entity_type` is the UI vocabulary (lowercase): order | unit | receiving |
--   sku | repair | fba. `entity_search_docs.entity_type` is the DB vocabulary
--   (uppercase); `UI_TO_DB` in search-hit.ts is the one mapping between them.
--   Storing the UI form keeps `?sel=` a direct read with no translation at the
--   point where a wrong guess would open the wrong record.
--
-- MRU SEMANTICS
--   Unchanged: the arbiter stays (organization_id, staff_id, scope,
--   lower(query)). Opening a record UPGRADES the query row that found it, in
--   place. Re-opening the same record from a different query collapses the
--   older row first (a DELETE in the same transaction — see `pushStaffRecent`),
--   so one record is one row. A second UNIQUE index is deliberately NOT added:
--   two arbiters on one table means an INSERT can violate the index the
--   ON CONFLICT clause did not name, which raises instead of upserting.
--
-- EXPAND-ONLY
--   Both columns are nullable with no default, so this ships safely ahead of
--   the code that reads them. Rows written before it carry NULL and render as
--   the honest query-only row the rail already has a face for.
--
--   `top_hit` and `scope_href` are LEFT IN PLACE and still read by the global
--   header dropdown (`SearchRecentsDropdown`). Dropping them is a separate
--   CONTRACT step, after every reader has moved to the pair above.
--
-- IDEMPOTENCY / ROLLBACK
--   Idempotent DDL (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
--   guarded constraint). Rollback:
--     DROP INDEX IF EXISTS idx_search_recents_entity;
--     ALTER TABLE search_recents
--       DROP CONSTRAINT IF EXISTS search_recents_entity_pair,
--       DROP COLUMN IF EXISTS entity_type,
--       DROP COLUMN IF EXISTS entity_id;
--
-- VERIFY (after /db-migrate)
--   npm run tenancy:coverage
-- ============================================================================

BEGIN;

ALTER TABLE search_recents
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id   BIGINT;

-- Both halves, or neither. A row naming a type with no id (or the reverse)
-- cannot build a `?sel=` and cannot be resolved against entity_search_docs — it
-- would paint as a record while behaving like a query, which is precisely the
-- ambiguity this table is being cleaned of.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'search_recents_entity_pair'
  ) THEN
    ALTER TABLE search_recents
      ADD CONSTRAINT search_recents_entity_pair
      CHECK ((entity_type IS NULL) = (entity_id IS NULL));
  END IF;
END $$;

-- The collapse-on-reopen probe in `pushStaffRecent`. Partial: query-only rows
-- are the majority and are never looked up by entity.
CREATE INDEX IF NOT EXISTS idx_search_recents_entity
  ON search_recents (organization_id, staff_id, entity_type, entity_id)
  WHERE entity_type IS NOT NULL;

COMMENT ON COLUMN search_recents.entity_type IS
  'UI entity vocabulary (order|unit|receiving|sku|repair|fba) of the record this search opened. NULL = the operator searched and opened nothing. `?sel=` is built from (entity_type, entity_id) — never parsed out of scope_href/top_hit.';
COMMENT ON COLUMN search_recents.entity_id IS
  'Primary key of the opened record in its own table; joins entity_search_docs on (UI_TO_DB(entity_type), entity_id). Paired with entity_type by search_recents_entity_pair.';

COMMIT;
