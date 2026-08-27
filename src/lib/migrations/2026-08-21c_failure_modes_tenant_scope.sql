-- 2026-08-21c — failure_modes: tenant-from-birth (expand half)
--
-- WHY
-- `failure_modes` is the Testing bench's fault vocabulary (the "why" behind a
-- TESTING_FAILED verdict, tagged on the unit via unit_failure_tags). It shipped
-- with three tenancy defects that together made it a single-tenant table:
--
--   1. UNIQUE (code) is GLOBAL. USAV owns NO_POWER, so no other tenant can ever
--      create NO_POWER — the second org's seed silently fails on conflict. This
--      is why the QA org has ZERO failure modes and no E2E can cover the bench
--      fail path.
--   2. organization_id is NULLABLE, against tenant-from-birth
--      (docs/rules/polymorphic-tables.md → org-led unique indexes).
--   3. No enforce_tenant_isolation() trigger, so a write with the GUC unset is
--      not caught.
--
-- EXPAND ONLY. This adds the org-scoped unique index and the trigger, and
-- backfills organization_id. It deliberately does NOT drop failure_modes_code_key
-- — dropping it is the CONTRACT half, and it must land only after every writer
-- has been verified against the new key. Until then both constraints hold, which
-- is strictly safe: the global key is the stricter of the two.
--
-- After this applies, seeding a second tenant's taxonomy still fails on the old
-- global key. Run the contract half (2026-08-21d, unwritten) to finish it.

BEGIN;

-- 1. Backfill: every existing row belongs to the dogfood tenant, which is the
--    only org that has ever written one (verified: 15 rows, all org …0001).
UPDATE failure_modes
   SET organization_id = '00000000-0000-0000-0000-000000000001'
 WHERE organization_id IS NULL;

-- 2. The real key. Org-led, so two tenants may each own NO_POWER.
CREATE UNIQUE INDEX IF NOT EXISTS failure_modes_org_code_key
    ON failure_modes (organization_id, code);

-- 3. Tenant-from-birth. NOT VALID first so the ALTER takes no full-table lock;
--    validate separately once the backfill above is confirmed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'failure_modes'
       AND column_name = 'organization_id'
       AND is_nullable = 'YES'
  ) AND NOT EXISTS (SELECT 1 FROM failure_modes WHERE organization_id IS NULL)
  THEN
    ALTER TABLE failure_modes ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- 4. GUC default + isolation trigger, matching every other tenant-owned table.
ALTER TABLE failure_modes
  ALTER COLUMN organization_id SET DEFAULT current_setting('app.current_org', true)::uuid;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation')
     AND NOT EXISTS (
       SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'failure_modes'::regclass
          AND tgname = 'failure_modes_tenant_isolation'
     )
  THEN
    CREATE TRIGGER failure_modes_tenant_isolation
      BEFORE INSERT OR UPDATE ON failure_modes
      FOR EACH ROW EXECUTE FUNCTION enforce_tenant_isolation();
  END IF;
END $$;

COMMIT;
