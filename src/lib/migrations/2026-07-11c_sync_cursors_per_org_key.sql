-- ============================================================================
-- 2026-07-11c_sync_cursors_per_org_key.sql   (RLS Phase E prep — AUTHOR ONLY)
--
-- sync_cursors is org-scoped (organization_id NOT NULL + enforce_tenant_isolation,
-- 2026-05-23 / 2026-06-22) but its PRIMARY KEY is still the GLOBAL `resource`
-- column. That means two tenants CANNOT both hold a cursor for the same resource
-- (e.g. 'zoho_fulfillment_sync') — the second INSERT collides on the single-column
-- PK, and `updateSyncCursor`'s `ON CONFLICT (resource)` overwrites another org's
-- cursor. This migration re-keys the table on the per-org composite
-- (organization_id, resource) so each tenant tracks its own sync watermark.
--
-- UNAPPLIED — authored only (do NOT apply; do not drizzle-kit push). Applying it
-- REQUIRES a matching caller change in src/lib/sync-cursors.ts:
--   getSyncCursor(resource, orgId)   → WHERE organization_id = $2 AND resource = $1
--   updateSyncCursor(resource, at, orgId) → ON CONFLICT (organization_id, resource)
-- Ship those in the same PR that applies this.
--
-- Idempotent + safe: existing rows already carry a NOT NULL organization_id (the
-- GUC default backfilled them), so the composite key has no NULLs to resolve.
-- ============================================================================

BEGIN;

-- 1. Drop the legacy single-column PK on `resource` (named `sync_cursors_pkey`
--    by convention). Guard so a re-run is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'sync_cursors'::regclass
       AND contype = 'p'
       AND conname = 'sync_cursors_pkey'
  ) THEN
    -- Only drop if it is the OLD single-column (resource) PK, not an already
    -- migrated composite one.
    IF (
      SELECT array_length(conkey, 1) FROM pg_constraint
       WHERE conrelid = 'sync_cursors'::regclass AND contype = 'p' AND conname = 'sync_cursors_pkey'
    ) = 1 THEN
      ALTER TABLE sync_cursors DROP CONSTRAINT sync_cursors_pkey;
    END IF;
  END IF;
END $$;

-- 2. Add the per-org composite PK. IF NOT EXISTS via the duplicate_object guard.
DO $$
BEGIN
  ALTER TABLE sync_cursors
    ADD CONSTRAINT sync_cursors_org_resource_pkey PRIMARY KEY (organization_id, resource);
EXCEPTION WHEN duplicate_object THEN NULL;
         WHEN invalid_table_definition THEN NULL; -- PK already present under another name
END $$;

-- 3. Keep the read index; add an org-led lookup index for cursor scans.
CREATE INDEX IF NOT EXISTS idx_sync_cursors_org_resource
  ON sync_cursors (organization_id, resource);

COMMIT;
