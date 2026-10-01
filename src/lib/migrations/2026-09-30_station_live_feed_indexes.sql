-- Station live feed V2 indexes.
--
-- WHAT / WHY
--   The additive `/stations/live` projection reads SAL, ops-events, and resolver
--   ledgers by tenant and event time. A resolver row is suppressed when a
--   committed phone SAL metadata object or ops-event payload references
--   `mobile_scan_event_id`. These indexes keep those predicates index-backed.
--
-- SAFETY GATE
--   All three tables already carry NOT NULL organization_id, enforced tenant
--   isolation, and every writer stamps the authenticated tenant. This migration
--   adds indexes only; it does not rewrite rows or change writer behavior.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_sal_org_phone_created;
--   DROP INDEX IF EXISTS idx_sal_org_phone_mobile_scan_event;
--   DROP INDEX IF EXISTS idx_ops_events_org_phone_occurred;
--   DROP INDEX IF EXISTS idx_ops_events_org_phone_mobile_scan_event;
--   DROP INDEX IF EXISTS idx_mse_org_created_id;
--
-- VERIFY
--   EXPLAIN (ANALYZE, BUFFERS) the three source arms in
--   src/lib/station-feed/query.server.ts and confirm these indexes are selected.

CREATE INDEX IF NOT EXISTS idx_sal_org_phone_created
  ON station_activity_logs (organization_id, created_at DESC, id DESC)
  WHERE metadata->>'origin' = 'phone';

CREATE INDEX IF NOT EXISTS idx_sal_org_phone_mobile_scan_event
  ON station_activity_logs (organization_id, (metadata->>'mobile_scan_event_id'))
  WHERE metadata->>'origin' = 'phone'
    AND metadata ? 'mobile_scan_event_id';

CREATE INDEX IF NOT EXISTS idx_ops_events_org_phone_occurred
  ON ops_events (organization_id, occurred_at DESC, id DESC)
  WHERE payload->>'origin' = 'phone';

CREATE INDEX IF NOT EXISTS idx_ops_events_org_phone_mobile_scan_event
  ON ops_events (organization_id, (payload->>'mobile_scan_event_id'))
  WHERE payload->>'origin' = 'phone'
    AND payload ? 'mobile_scan_event_id';

CREATE INDEX IF NOT EXISTS idx_mse_org_created_id
  ON mobile_scan_events (organization_id, created_at DESC, id DESC);
