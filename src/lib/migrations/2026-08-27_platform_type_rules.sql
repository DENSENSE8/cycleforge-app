-- Platform → receiving-type dependency: which types are legal for a platform,
-- and which one an operator gets for free.
--
-- The classify pills (platform · type) are two independent picklists today, so
-- an FBA carton can be filed as a Purchase order. It never is — an FBA carton
-- arriving at the dock is a customer return — but nothing says so, which means
-- the bar asks the operator a question that has exactly one answer.
--
-- This is the standard "dependent picklist" shape: platform is the CONTROLLING
-- field, type is the DEPENDENT one, and this table is the dependency matrix.
--
-- ## Open by default, closed per platform
--
-- A platform with NO rows here allows every active type. A platform WITH rows
-- allows only those. That is deliberate and it is the whole ergonomics of the
-- feature: constraining FBA costs one row, not eight. The same grammar as the
-- catalogs it sits beside — `usePlatformCatalog` reads `rows.length ? rows :
-- BUILTIN`, where presence flips the mode rather than absence being a gap to
-- backfill. A globally-closed table would make every new platform a migration.
--
-- ## is_default
--
-- The point of the feature, not a convenience. When a platform's allowed set has
-- exactly one member the UI applies it and stops asking; `is_default` lets a
-- multi-type platform pre-select without forbidding the rest. The partial unique
-- index makes "two defaults for one platform" unrepresentable rather than a
-- thing the read model has to arbitrate.
--
-- ## Grandfathering
--
-- Nothing here rewrites `receiving.receiving_type`. Rules are validated on WRITE,
-- never on read, so adding a rule can never make an existing carton unopenable.
--
-- Tenant-scoped from birth: organization_id NOT NULL, enforced via the
-- enforce_tenant_isolation() helper (2026-06-14_rls_enforcement_infra.sql) so
-- the loud-fail DEFAULT + FORCE RLS + canonical tenant_isolation policy land in
-- one shot. Safe because the only writer (platform-type-rules queries) runs
-- inside withTenantTransaction (sets app.current_org) AND stamps
-- organization_id explicitly. RLS stays inert until the app connects as the
-- non-BYPASSRLS app_tenant role (Phase E1); the loud-fail default is the
-- immediate backstop.
--
-- Both FKs are per-org rows already (`platforms`, `types` lead their unique keys
-- with organization_id), so a rule can only ever join two rows this org owns.
--
-- ROLLBACK:
--   select relax_tenant_isolation('platform_type_rules');
--   drop table if exists platform_type_rules;
--
-- VERIFY (expect one row: fba → RETURN, default):
--   select p.slug, t.slug, r.is_default
--     from platform_type_rules r
--     join platforms p on p.id = r.platform_id
--     join types     t on t.id = r.type_id;

CREATE TABLE IF NOT EXISTS platform_type_rules (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  platform_id     BIGINT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  type_id         BIGINT NOT NULL REFERENCES types(id) ON DELETE CASCADE,
  -- Pre-selected for this platform. At most one per (org, platform) — see the
  -- partial unique index below.
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One rule per pair, per org.
  CONSTRAINT platform_type_rules_org_pair_unique
    UNIQUE (organization_id, platform_id, type_id)
);

-- The read path is always "the allowed set for this platform".
CREATE INDEX IF NOT EXISTS idx_platform_type_rules_org_platform
  ON platform_type_rules (organization_id, platform_id);

-- At most ONE default per platform. Partial unique index rather than a trigger:
-- a second default is then unrepresentable, not merely rejected by a code path
-- that a bulk import could skip.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_type_rules_org_platform_default
  ON platform_type_rules (organization_id, platform_id)
  WHERE is_default;

-- Flip on FORCE RLS + loud-fail org default + canonical policy, if the
-- enforcement infra is present in this DB. Guarded so a fresh DB without the
-- helper still gets the table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('platform_type_rules');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — platform_type_rules left without FORCE RLS';
  END IF;
END $$;

-- Seed the rule this table was built for, for every org that has both rows:
-- an FBA carton at the dock is a customer return, never a purchase order.
--
-- Idempotent via the pair unique constraint. Deliberately seeds ONLY fba: every
-- other platform stays unconstrained (no rows = all types), which is the default
-- posture described above.
INSERT INTO platform_type_rules (organization_id, platform_id, type_id, is_default)
SELECT p.organization_id, p.id, t.id, true
  FROM platforms p
  JOIN types t
    ON t.organization_id = p.organization_id
   AND upper(t.slug) = 'RETURN'
 WHERE p.slug = 'fba'
ON CONFLICT (organization_id, platform_id, type_id) DO NOTHING;
