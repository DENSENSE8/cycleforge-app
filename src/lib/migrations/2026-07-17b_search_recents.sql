-- ============================================================================
-- search_recents — per-staff "most recently searched" history (DB-backed)
--   (Dashboard sidebar modes — Search mode; docs/todo/dashboard-modes-…md P4)
--
-- WHAT / WHY
--   The Dashboard Search mode's sidebar shows the signed-in staffer's recent
--   queries. The prior store (cf_search_recents_v1) is per-BROWSER localStorage,
--   so it neither follows a staffer across devices nor survives a cache wipe.
--   This table is the per-STAFF, cross-device SoT: one MRU row per
--   (org, staff, scope, normalized query).
--
--   It is a typed-fact table (not polymorphic): a real FK to staff(id) gives
--   parent-delete integrity, and the row is tenant-scoped from birth.
--
-- MRU SEMANTICS
--   A repeat search does NOT append a new row — the unique key
--   (organization_id, staff_id, scope, lower(query)) collapses it and the
--   writer bumps created_at (see pushStaffRecent). Reads are newest-first,
--   capped in the domain helper (STAFF_RECENTS_MAX); the writer also trims the
--   tail so the table stays bounded per staffer.
--
-- TENANCY / SAFETY GATING
--   Tenant-from-birth: organization_id UUID NOT NULL, NO DDL default;
--   enforce_tenant_isolation() in this same migration installs the loud-fail
--   GUC default + FORCE RLS + the canonical policy. Only writer is the new
--   /api/search/recents handler (this change), which stamps organization_id via
--   withTenantTransaction. No legacy writers exist (the table is new).
--
-- IDEMPOTENCY / ROLLBACK
--   Idempotent DDL (IF NOT EXISTS + guarded DO blocks). Rollback:
--     SELECT relax_tenant_isolation('search_recents');
--     DROP TABLE IF EXISTS search_recents;
--
-- VERIFY (after /db-migrate)
--   npm run tenancy:coverage
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS search_recents (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,                 -- no default; enforce_tenant_isolation() installs it
  staff_id         INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  query            TEXT NOT NULL,                  -- the raw query as typed (display); dedupe on lower()
  scope            TEXT NOT NULL DEFAULT 'global', -- search scope key (e.g. 'global', 'dashboard')
  scope_label      TEXT,                           -- optional human label for the scope chip
  scope_href       TEXT,                           -- optional re-run target (else /search?q=…)
  result_count     INTEGER,                        -- optional: how many hits the query returned
  top_hit          JSONB,                          -- optional: { title, href, entityType } of the best hit
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT search_recents_query_len CHECK (char_length(query) BETWEEN 1 AND 256)
);

-- MRU dedupe key — one row per (org, staff, scope, normalized query). The writer
-- upserts on this and bumps created_at so a repeat search floats to the top.
CREATE UNIQUE INDEX IF NOT EXISTS ux_search_recents_natural
  ON search_recents (organization_id, staff_id, scope, lower(query));

-- Read path — a staffer's newest-first list. Org-led per the tenancy contract.
CREATE INDEX IF NOT EXISTS idx_search_recents_staff_recent
  ON search_recents (organization_id, staff_id, created_at DESC, id DESC);

COMMENT ON TABLE search_recents IS
  'Per-staff most-recently-searched history (Dashboard Search mode). MRU by (org, staff, scope, lower(query)); newest-first, capped in the domain helper. Tenant-scoped from birth.';

-- Tenant-from-birth enforcement (loud-fail GUC default + FORCE RLS + canonical
-- tenant_isolation policy). Guarded so the migration is a no-op where the
-- function is absent (fresh/partial envs).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('search_recents');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — search_recents left without FORCE RLS';
  END IF;
END $$;

COMMIT;
