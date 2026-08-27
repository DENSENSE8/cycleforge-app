-- 2026-08-26_receiving_line_testing_opens.sql
-- Per-staff Quality Control recents (QC rail "Recent"). One row per
-- (org, staff, line); opened_at upserts to NOW() each time that staffer
-- opens the line in the Testing workspace. Separate from receiving_line_views
-- so Unbox Recent is never polluted by QC opens (and vice versa).
--
-- Tenant-scoped from birth: organization_id NOT NULL, enforced via
-- enforce_tenant_isolation() so the loud-fail DEFAULT + FORCE RLS + canonical
-- policy land together. Safe because the only writer
-- (POST /api/testing/receiving-lines/open) runs inside tenantQuery and stamps
-- organization_id from ctx.organizationId.
--
-- ROLLBACK: select relax_tenant_isolation('receiving_line_testing_opens');
-- then DROP TABLE IF EXISTS receiving_line_testing_opens;

CREATE TABLE IF NOT EXISTS receiving_line_testing_opens (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL,
  staff_id          INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  receiving_line_id INTEGER NOT NULL REFERENCES receiving_line(id) ON DELETE CASCADE,
  receiving_id      INTEGER,
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT receiving_line_testing_opens_org_staff_line_unique
    UNIQUE (organization_id, staff_id, receiving_line_id)
);

COMMENT ON TABLE receiving_line_testing_opens IS
  'Per-staff QC recents (Testing rail). Upserted on open; ordered by opened_at DESC on read. Isolated from Unbox receiving_line_views.';

CREATE INDEX IF NOT EXISTS idx_receiving_line_testing_opens_staff_recent
  ON receiving_line_testing_opens (organization_id, staff_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_receiving_line_testing_opens_line
  ON receiving_line_testing_opens (receiving_line_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('receiving_line_testing_opens');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — receiving_line_testing_opens left without FORCE RLS';
  END IF;
END $$;
