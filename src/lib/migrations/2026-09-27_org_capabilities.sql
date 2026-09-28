-- org_capabilities + org_capability_events — SIMPLE-FIRST (docs/product/SIMPLE-FIRST.md).
--
-- A new org starts with only the AI chat; every other surface is a CAPABILITY
-- the org unlocks (from the chat, or from Settings → Capabilities). The
-- sidebar shows the nav rows of the org's ACTIVE capabilities only.
--
--   org_capabilities        one row per (org, capability) the org has touched:
--                           state suggested → setting_up → active (or locked
--                           again after a revert). No row = locked. The base
--                           capability ('chat') is implicit in code, never a row.
--   org_capability_events   the org's build history (append-only ledger):
--                           who / when / what, like a git log.
--
-- Capability ids are validated by src/lib/capabilities/catalog.ts, deliberately
-- NOT a CHECK — the catalog grows without a migration (same rule as
-- agent_mutations.mutation_kind). state / source / event are small stable
-- lifecycles → named CHECKs.
--
-- ROLLOUT RULE: every org that exists when this runs gets EVERY capability of
-- the catalog backfilled as active (source 'backfill', one 'backfilled' event
-- each) so nothing disappears for USAV or any other existing tenant. Orgs
-- created afterwards start chat-only.
--
-- Tenant-scoped from birth: organization_id NOT NULL, enforced via
-- enforce_tenant_isolation() (2026-06-14_rls_enforcement_infra.sql). Safe
-- because the only writer (src/lib/capabilities/store.ts) runs every statement
-- inside withTenantTransaction / tenantQuery (sets app.current_org) AND stamps
-- organization_id explicitly. The backfill below stamps it explicitly too.
--
-- Additive only: two new tables, no change to any existing table or row.
--
-- ROLLBACK:
--   select relax_tenant_isolation('org_capability_events'); DROP TABLE IF EXISTS org_capability_events;
--   select relax_tenant_isolation('org_capabilities');      DROP TABLE IF EXISTS org_capabilities;
--
-- Verify:
--   SELECT organization_id, count(*) FROM org_capabilities GROUP BY 1;
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE relname IN ('org_capabilities', 'org_capability_events');

CREATE TABLE IF NOT EXISTS org_capabilities (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  capability_id       TEXT NOT NULL,
  state               TEXT NOT NULL
    CONSTRAINT org_capabilities_state_check
    CHECK (state IN ('locked', 'suggested', 'setting_up', 'active')),
  enabled_by_staff_id INTEGER NULL REFERENCES staff(id) ON DELETE SET NULL,
  enabled_at          TIMESTAMPTZ NULL,
  source              TEXT NOT NULL
    CONSTRAINT org_capabilities_source_check
    CHECK (source IN ('chat', 'settings', 'backfill', 'system')),
  -- Per-capability setup facts (e.g. the eBay account a product import used).
  config              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT org_capabilities_org_capability_unique UNIQUE (organization_id, capability_id)
);

CREATE TABLE IF NOT EXISTS org_capability_events (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  capability_id     TEXT NOT NULL,
  event             TEXT NOT NULL
    CONSTRAINT org_capability_events_event_check
    CHECK (event IN ('suggested', 'setup_started', 'activated', 'deactivated', 'backfilled', 'imported')),
  from_state        TEXT NULL,
  to_state          TEXT NULL,
  staff_id          INTEGER NULL REFERENCES staff(id) ON DELETE SET NULL,
  source            TEXT NOT NULL
    CONSTRAINT org_capability_events_source_check
    CHECK (source IN ('chat', 'settings', 'backfill', 'system')),
  -- The chat proposal that led here (agent_mutations.id), when there is one.
  agent_mutation_id BIGINT NULL,
  detail            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_capability_events_org_created
  ON org_capability_events (organization_id, created_at DESC, id DESC);

-- ── Backfill: every existing org keeps every surface it has today ─────────────
INSERT INTO org_capabilities (organization_id, capability_id, state, enabled_at, source)
SELECT o.id, c.capability_id, 'active', now(), 'backfill'
  FROM organizations o
 CROSS JOIN (VALUES
   ('outbound_orders'), ('purchase_orders'), ('products'), ('ebay_import'),
   ('inventory'), ('customer_counter'), ('quality_control'), ('amazon_fba'),
   ('support'), ('daily_ops'), ('automations')
 ) AS c(capability_id)
ON CONFLICT (organization_id, capability_id) DO NOTHING;

INSERT INTO org_capability_events (organization_id, capability_id, event, from_state, to_state, source, detail)
SELECT oc.organization_id, oc.capability_id, 'backfilled', NULL, 'active', 'backfill',
       jsonb_build_object('migration', '2026-09-27_org_capabilities')
  FROM org_capabilities oc
 WHERE oc.source = 'backfill'
   AND NOT EXISTS (
     SELECT 1 FROM org_capability_events e
      WHERE e.organization_id = oc.organization_id
        AND e.capability_id = oc.capability_id
        AND e.event = 'backfilled'
   );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('org_capabilities');
    PERFORM enforce_tenant_isolation('org_capability_events');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — org_capabilities / org_capability_events left without FORCE RLS';
  END IF;
END $$;
