-- ============================================================================
-- 2026-07-17d: entity_search_docs — serial_number facet column
-- ============================================================================
-- Closes the GlobalHeaderSearch → Item Journey handoff waist: unit hits need
-- the full serial string to open `/operations?mode=history&dim=serial&serial=`
-- without a second fetch. Mirrors 2026-07-06a (tracking_number / carrier) —
-- typed facet column, not jsonb.
--
-- ADDITIVE + NULLABLE + IDEMPOTENT. No RLS change. Builder
-- (build-search-text.ts buildSerialUnitDoc / buildRepairDoc) + worker upsert
-- populate it; hybrid-retrieval SELECTs pass it through to SearchHit.facets.
--
-- BACKFILL: re-enqueue SERIAL_UNIT (+ REPAIR, which also carries a serial) so
-- the worker refreshes on the next drain. Deduped against the pending partial
-- unique.
--
-- ROLLBACK:
--   ALTER TABLE entity_search_docs DROP COLUMN IF EXISTS serial_number;
-- ============================================================================

BEGIN;

ALTER TABLE entity_search_docs ADD COLUMN IF NOT EXISTS serial_number TEXT;

INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
SELECT organization_id, entity_type, entity_id
FROM entity_search_docs
WHERE entity_type IN ('SERIAL_UNIT', 'REPAIR')
ON CONFLICT (organization_id, entity_type, entity_id)
  WHERE processed_at IS NULL AND claimed_at IS NULL
DO NOTHING;

COMMIT;
