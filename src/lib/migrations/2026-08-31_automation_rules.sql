-- ============================================================================
-- 2026-08-31_automation_rules.sql
--
-- Listing → staff automations (OMS ECA). Org-owned rule document + append-only
-- run log so item_number / sku_catalog_id can assign TEST (QC) and PACK (pick)
-- work_assignments on import, item-number set, and post-PASS allocate.
--
-- Vocabulary is TEXT + JSONB (K12) — no Postgres enums. Writers stamp
-- organization_id and run under withTenantTransaction / tenantQuery, so
-- tenant-from-birth FORCE RLS is safe immediately.
--
-- ROLLBACK:
--   select relax_tenant_isolation('automation_runs');
--   select relax_tenant_isolation('automation_rules');
--   DROP TABLE IF EXISTS automation_runs;
--   DROP TABLE IF EXISTS automation_rules;
--
-- VERIFY (after apply): npm run tenancy:coverage
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS automation_rules (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       UUID NOT NULL,
  name                  TEXT NOT NULL,
  description           TEXT,
  enabled               BOOLEAN NOT NULL DEFAULT true,
  -- Same convention as work_assignments.priority: LOWER sorts first.
  priority              INTEGER NOT NULL DEFAULT 100,
  -- Registry keys (app-side): order.imported | order.item_number_set | unit.test_passed
  trigger_keys          TEXT[] NOT NULL DEFAULT ARRAY[
                          'order.imported',
                          'order.item_number_set',
                          'unit.test_passed'
                        ]::text[],
  -- Decision-table when facts, e.g. { "item_number": "9M52B2C4", "sku_catalog_id": "12" }
  when_json             JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Actions, e.g. [{ "type": "assign_work", "work_type": "TEST", "staff_id": 7 }, …]
  then_json             JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by_staff_id   INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  updated_by_staff_id   INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,
  CONSTRAINT automation_rules_name_chk CHECK (length(btrim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_org_trigger
  ON automation_rules (organization_id, priority)
  WHERE deleted_at IS NULL AND enabled;

-- One active mapping per org + normalized marketplace item number.
CREATE UNIQUE INDEX IF NOT EXISTS ux_automation_rules_org_item_number
  ON automation_rules (
    organization_id,
    upper(regexp_replace(trim(COALESCE(when_json->>'item_number', '')), '[^A-Za-z0-9]', '', 'g'))
  )
  WHERE deleted_at IS NULL
    AND NULLIF(trim(COALESCE(when_json->>'item_number', '')), '') IS NOT NULL;

COMMENT ON TABLE automation_rules IS
  'Org-owned listing→staff automation rules. when_json matches order facts; then_json writes work_assignments via the shared upsert helper.';

CREATE TABLE IF NOT EXISTS automation_runs (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       UUID NOT NULL,
  rule_id               BIGINT REFERENCES automation_rules(id) ON DELETE SET NULL,
  trigger_key           TEXT NOT NULL,
  -- Polymorphic subject (ops_events pattern): 'order' | 'serial_unit' | …
  entity_type           TEXT NOT NULL,
  entity_id             BIGINT NOT NULL,
  -- applied | skipped | failed
  status                TEXT NOT NULL,
  matched_when          JSONB,
  actions_applied       JSONB,
  error                 TEXT,
  actor_staff_id        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE automation_runs ADD CONSTRAINT automation_runs_status_chk
    CHECK (status IN ('applied', 'skipped', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_automation_runs_org_entity
  ON automation_runs (organization_id, entity_type, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_runs_org_rule
  ON automation_runs (organization_id, rule_id, occurred_at DESC);

COMMENT ON TABLE automation_runs IS
  'Append-only log of automation_rules evaluations. Polymorphic entity_type/entity_id; also mirrored to ops_events when applied.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('automation_rules');
    PERFORM enforce_tenant_isolation('automation_runs');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — automation_rules/runs left without FORCE RLS';
  END IF;
END $$;

COMMIT;
