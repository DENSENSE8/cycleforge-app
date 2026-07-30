-- ============================================================================
-- 2026-07-29g — polymorphic saved_views (Shape A)
--
-- WHY: three implementations of one concept — operations_saved_views,
-- media_library_saved_views, and the localStorage useSavedViews hook — become
-- one org-scoped, staff-owned table discriminated by `surface`. Ratified
-- 2026-07-29 (dashboard IA row K); explicit waiver of polymorphic-tables'
-- "don't migrate existing surfaces" for this consolidation.
--
-- SAFETY GATE: every writer (ops/photos/generic saved-views routes) stamps
-- organization_id explicitly and runs under withTenantTransaction /
-- tenantQuery (sets app.current_org). FORCE RLS + loud-fail default are safe
-- from birth.
--
-- ROLLBACK (dev only):
--   SELECT relax_tenant_isolation('saved_views');
--   DROP TABLE IF EXISTS saved_views CASCADE;
--   -- legacy tables remain until 2026-07-29h; reverse the INSERT…SELECT
--   -- only if you need the old rows restored (they are copied, not moved).
--
-- VERIFY:
--   SELECT surface, count(*) FROM saved_views GROUP BY 1;
--   -- after code cutover + 2026-07-29h: legacy tables gone.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS saved_views (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,                 -- NO default; enforce_tenant_isolation installs it
  staff_id        INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  -- Discriminator: which UI surface owns this named filter preset.
  -- CHECK constrained below; keep in lockstep with SAVED_VIEW_SURFACES in
  -- src/lib/saved-views/surfaces.ts.
  surface         TEXT NOT NULL,
  name            TEXT NOT NULL,
  -- Surface-specific filter snapshot (JSONB bag so new filters need no migration).
  -- Dashboard/station views store { query: "<urlencoded param subset>" }.
  -- Ops/media keep their existing filter object shapes.
  filters         JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared       BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT saved_views_name_chk CHECK (length(btrim(name)) > 0),
  -- One view name per staff per org per surface.
  CONSTRAINT saved_views_org_staff_surface_name_uniq
    UNIQUE (organization_id, staff_id, surface, name)
);

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
      'testing_history'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_saved_views_org_staff_surface
  ON saved_views (organization_id, staff_id, surface, sort_order);

CREATE INDEX IF NOT EXISTS idx_saved_views_org_surface_shared
  ON saved_views (organization_id, surface) WHERE is_shared = true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('saved_views');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — saved_views left without FORCE RLS';
  END IF;
END $$;

-- ── Data migrate (copy, not move — DROP is 2026-07-29h after code cutover) ──
-- Idempotent: skip rows already present under the same org/staff/surface/name.
-- Source tables exist at apply time (earlier migrations); h drops them after.

INSERT INTO saved_views (
  organization_id, staff_id, surface, name, filters, is_shared, sort_order, created_at, updated_at
)
SELECT
  organization_id,
  staff_id,
  'operations',
  name,
  filters,
  is_shared,
  sort_order,
  created_at,
  updated_at
FROM operations_saved_views osv
WHERE NOT EXISTS (
  SELECT 1 FROM saved_views sv
  WHERE sv.organization_id = osv.organization_id
    AND sv.staff_id = osv.staff_id
    AND sv.surface = 'operations'
    AND sv.name = osv.name
);

INSERT INTO saved_views (
  organization_id, staff_id, surface, name, filters, is_shared, sort_order, created_at, updated_at
)
SELECT
  organization_id,
  staff_id,
  'media_library',
  name,
  filters,
  is_shared,
  sort_order,
  created_at,
  updated_at
FROM media_library_saved_views mlv
WHERE NOT EXISTS (
  SELECT 1 FROM saved_views sv
  WHERE sv.organization_id = mlv.organization_id
    AND sv.staff_id = mlv.staff_id
    AND sv.surface = 'media_library'
    AND sv.name = mlv.name
);

COMMIT;
