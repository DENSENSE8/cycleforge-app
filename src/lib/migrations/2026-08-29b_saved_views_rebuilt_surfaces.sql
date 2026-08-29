-- ============================================================================
-- 2026-08-29b — saved_views: admit the twelve surfaces rebuilt in Phase 4
--
-- WHY: `docs/todo/one-sheet-table-sot-PLAN.md` Phase 4 brought twenty-six
-- stubbed table surfaces back on the binding waist, and Phase 6 gives every one
-- of them the same org-scoped saved views the outbound and station lanes
-- already have. `useSavedViews` resolves a storage key to a DB discriminator; a
-- discriminator the CHECK does not list 23514s on its FIRST insert, and the only
-- symptom in the UI is a Save button that silently does nothing.
--
-- SHAPE: DROP then re-ADD with the **full union**, never an incremental edit.
-- `.claude/rules/polymorphic-tables.md` records why: five migrations edited
-- `reason_codes_flow_context_chk` and several dropped values an earlier one had
-- added — the union survived only because the last-sorting filename happened to
-- re-affirm everything. A CHECK is redefined, not appended to, so the
-- last-sorting definition must be the whole truth on its own.
--
-- The twelve added here are exactly the `TableId`s whose bindings landed in
-- Phase 4, plus `products_catalog`. Keep in lockstep with SAVED_VIEW_SURFACES in
-- src/lib/saved-views/surfaces.ts — surfaces.test.ts resolves the EFFECTIVE
-- CHECK off disk (the last-sorting migration that defines it) and compares the
-- two sets, so a value present in only one half fails the build rather than
-- production.
--
-- ROLLBACK (dev only):
--   ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_surface_chk;
--   DELETE FROM saved_views WHERE surface IN (
--     'products_catalog','inventory_units','warehouse_bins','repair_queue',
--     'warranty_claims','tracking_exceptions','outbound_ready','outbound_labels',
--     'outbound_staged','pickup_queue','unfound_queue','tech_all');
--   -- then re-ADD the 11-value union from 2026-08-01a.
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
      -- ── the eleven from 2026-08-01a, re-affirmed in full ──────────────────
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
      -- ── Phase 4 rebuilds (2026-08-29) ─────────────────────────────────────
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
      'tech_all'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
