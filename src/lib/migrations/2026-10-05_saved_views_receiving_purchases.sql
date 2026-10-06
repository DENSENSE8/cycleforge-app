-- ============================================================================
-- 2026-10-05 — saved_views: admit Deliveries › Purchases (`receiving_purchases`)
--
-- WHY: Deliveries gained a fourth view, Purchases (`/incoming?lane=purchases`),
-- whose sidebar Views row saves its own filters (date axis + window, source,
-- vendor, unboxed by, column sort, status chip) under its own storage key
-- (`SAVED_VIEW_STORAGE_KEY.receiving_purchases`). `useSavedViews` resolves that
-- key to the `receiving_purchases` discriminator; a discriminator the CHECK does
-- not list 23514s on its FIRST insert, and the only symptom in the UI is a Save
-- button that silently does nothing.
--
-- SHAPE: DROP then re-ADD with the **full union**, never an incremental edit
-- (`.claude/rules/polymorphic-tables.md`; same shape as 2026-08-29b). Keep in
-- lockstep with SAVED_VIEW_SURFACES in src/lib/saved-views/surfaces.ts —
-- surfaces.test.ts resolves the EFFECTIVE CHECK off disk (the last-sorting
-- migration that defines it) and compares the two sets.
--
-- SAFETY: widening a CHECK admits a value no row holds yet; existing rows all
-- satisfy the new union (it is a superset of 2026-08-29b's).
--
-- ROLLBACK (dev only):
--   DELETE FROM saved_views WHERE surface = 'receiving_purchases';
--   then re-ADD the 23-value union from 2026-08-29b.
--
-- VERIFY:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'saved_views_surface_chk';
-- ============================================================================

BEGIN;

ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_surface_chk;

DO $$ BEGIN
  ALTER TABLE saved_views ADD CONSTRAINT saved_views_surface_chk
    CHECK (surface IN (
      -- ── the union from 2026-08-29b, re-affirmed in full ───────────────────
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
      -- ── live in the shared DB from another lane's migration (not in this tree) ──
      'reports_sessions',
      -- ── Deliveries › Purchases (2026-10-05) ───────────────────────────────
      'receiving_purchases'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
