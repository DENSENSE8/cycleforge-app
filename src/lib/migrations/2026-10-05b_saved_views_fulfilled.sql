-- ============================================================================
-- 2026-10-05 — saved_views: admit Fulfilled (`outbound_fulfilled`)
--
-- WHY: Fulfilled (`/fulfilled`) is now the shared datasheet over
-- `GET /api/nav/fulfilled`, whose sidebar Views row saves its own filters
-- (date axis + window, channel, carrier, packer, scan source, grain, column
-- sort, status chip — `FULFILLED_ONLY_PARAMS`) under its own storage key
-- (`SAVED_VIEW_STORAGE_KEY.outbound_fulfilled`). `useSavedViews` resolves that
-- key to the `outbound_fulfilled` discriminator; a discriminator the CHECK does
-- not list 23514s on its FIRST insert, and the only symptom in the UI is a Save
-- button that silently does nothing. The old ledger's `dashboard_shipped`
-- views spoke a retired vocabulary (`shippedFilter`, `cardStatus`, …), so the
-- sheet starts a fresh surface; `dashboard_shipped` stays admitted (never drop
-- a value from a shared CHECK — the DB is shared across lanes).
--
-- SHAPE: DROP then re-ADD with the **full union**, never an incremental edit
-- (`.claude/rules/polymorphic-tables.md`; same shape as
-- 2026-10-05_saved_views_receiving_purchases — the `b` suffix makes this file
-- sort, and so apply and win, after that one).
-- 2026-10-05_saved_views_receiving_purchases). The union below is the LIVE
-- constraint read on 2026-10-05 (25 values) plus `outbound_fulfilled`. Keep in
-- lockstep with SAVED_VIEW_SURFACES in src/lib/saved-views/surfaces.ts —
-- surfaces.test.ts resolves the EFFECTIVE CHECK off disk (the last-sorting
-- migration that defines it) and compares the two sets.
--
-- SAFETY: widening a CHECK admits a value no row holds yet; existing rows all
-- satisfy the new union (it is a superset of the live one).
--
-- ROLLBACK (dev only):
--   DELETE FROM saved_views WHERE surface = 'outbound_fulfilled';
--   then re-ADD the 25-value union from 2026-10-05_saved_views_receiving_purchases.
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
      -- ── the live union (2026-10-05), re-affirmed in full ──────────────────
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
      'reports_sessions',
      'receiving_purchases',
      -- ── Fulfilled (2026-10-05) ────────────────────────────────────────────
      'outbound_fulfilled'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
