-- ============================================================================
-- 2026-09-02 — saved_views: admit Reports › Sessions
--
-- WHY: The Sessions slot table uses DataTable WorkbenchViewsMenu (named
-- filter combos on ?date=&staff=&q=&status=&scan=&colsort=). Website-wide pins
-- stay cf.quickAccess / staff_preferences.quickAccess — a different store.
--
-- SHAPE: DROP then re-ADD with the full union (never incremental).
-- Keep in lockstep with SAVED_VIEW_SURFACES.
-- ============================================================================

BEGIN;

ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_surface_chk;

DO $$ BEGIN
  ALTER TABLE saved_views ADD CONSTRAINT saved_views_surface_chk
    CHECK (surface IN (
      'operations',
      'media_library',
      'dashboard_unshipped',
      'dashboard_packed',
      'dashboard_shipped',
      'tech_history',
      'packer_history',
      'receiving_history',
      'receiving_incoming',
      'testing_history',
      'home_today',
      'products_catalog',
      'inventory_units',
      'warehouse_bins',
      'repair_queue',
      'warranty_claims',
      'tracking_exceptions',
      'outbound_ready',
      'outbound_labels',
      'outbound_staged',
      'pickup_queue',
      'unfound_queue',
      'tech_all',
      'reports_sessions'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
