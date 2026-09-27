-- ============================================================================
-- nav_recents — per-staff, per-surface "recently opened" records for the
--   contextual sidebar (docs/refactors/sidebar/BACKEND-HANDOFF.md, Phase 2)
--
-- WHAT / WHY
--   Five recents lists live only in browser localStorage today, so the Tauri
--   desktop app cannot reach them over HTTP and they do not follow a staffer
--   across devices: support:recent-tickets, assistant:recent-detail-stacks,
--   audit-log.trace.recents, labels:history-recents:v1, command-bar-recent.
--   This table is their one server store. A row is "staffer S opened entity
--   (entity_type, entity_id) on surface X at opened_at"; the label is a
--   snapshot for display only. Hrefs are NEVER stored — the domain builds them
--   from (surface, entity_type, entity_id) on read.
--
--   Polymorphic on purpose (one table, many surfaces), but every predicate the
--   hot paths use is a plain TEXT/INT/UUID equality or a timestamptz range, so
--   under forced RLS as app_tenant (non-BYPASSRLS) every key column stays an
--   Index Cond (texteq/int4eq/uuid_eq are leakproof; enums, jsonb ->>, lower()
--   are not — docs/refactors/sidebar/phase0-findings.md §Schema 0). Hence no
--   enum for surface/entity_type: the vocabularies are owned by
--   src/lib/nav/recents/surfaces.ts and validated in the route's zod schema.
--
-- MRU + CAP SEMANTICS
--   Opening the same entity again does NOT add a row: the unique key
--   (organization_id, staff_id, surface, entity_type, entity_id) collapses it
--   and the writer bumps opened_at + label_snapshot (upsert). The writer then
--   trims that staffer's surface to its cap (per-surface, in the domain
--   registry) in the SAME statement, so the table stays bounded.
--
-- TENANCY / SAFETY GATING
--   Tenant-from-birth: organization_id UUID NOT NULL with NO DDL default;
--   enforce_tenant_isolation() installs the loud-fail GUC default + FORCE RLS
--   + the canonical policy. The only writer is POST /api/nav/recents
--   (src/lib/nav/recents/store.ts), which runs inside withTenantTransaction
--   AND stamps organization_id/staff_id from the auth context. The table is
--   new, so there are no legacy writers.
--
-- IDEMPOTENCY / ROLLBACK
--   Idempotent DDL (IF NOT EXISTS + guarded DO block). Rollback:
--     SELECT relax_tenant_isolation('nav_recents');
--     DROP TABLE IF EXISTS nav_recents;
--
-- VERIFY (after /db-migrate)
--   \d+ nav_recents
--   npm run tenancy:coverage
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS nav_recents (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,                 -- no default; enforce_tenant_isolation() installs it
  staff_id        INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  surface         TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  label_snapshot  TEXT NOT NULL DEFAULT '',
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nav_recents_surface_len     CHECK (char_length(surface) BETWEEN 1 AND 64),
  CONSTRAINT nav_recents_entity_type_len CHECK (char_length(entity_type) BETWEEN 1 AND 64),
  CONSTRAINT nav_recents_entity_id_len   CHECK (char_length(entity_id) BETWEEN 1 AND 256),
  CONSTRAINT nav_recents_label_len       CHECK (char_length(label_snapshot) <= 512)
);

-- Upsert key — one row per (org, staff, surface, entity). Org-led per the
-- tenancy contract; all five columns are leakproof-equality text/int/uuid.
CREATE UNIQUE INDEX IF NOT EXISTS ux_nav_recents_entity
  ON nav_recents (organization_id, staff_id, surface, entity_type, entity_id);

-- Read path + trim path — a staffer's newest-first list for one surface.
-- `id DESC` breaks opened_at ties so the order (and the trim) is total.
CREATE INDEX IF NOT EXISTS idx_nav_recents_staff_surface_recent
  ON nav_recents (organization_id, staff_id, surface, opened_at DESC, id DESC);

COMMENT ON TABLE nav_recents IS
  'Per-staff, per-surface recently opened records for the contextual sidebar. MRU by (org, staff, surface, entity_type, entity_id); newest-first; capped per surface by the writer (src/lib/nav/recents). Tenant-scoped from birth.';
COMMENT ON COLUMN nav_recents.surface IS
  'Recents surface id from NAV_RECENT_SURFACES (src/lib/nav/recents/surfaces.ts), e.g. support.tickets. Plain text (no enum) so it stays an index condition under RLS.';
COMMENT ON COLUMN nav_recents.entity_id IS
  'Primary key / natural key of the opened record as text (ticket id, serial number, detail-stack id, …). Hrefs are built from (surface, entity_type, entity_id) on read, never stored.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('nav_recents');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — nav_recents left without FORCE RLS';
  END IF;
END $$;

COMMIT;
