-- 2026-07-28c_staff_subscriptions.sql
--
-- staff_subscriptions — the per-staff subscription registry behind the Home
-- Inbox (docs/todo/home-triage-subscriptions-*.md). ONE discriminated table
-- covering all three subscription kinds, because they share a lifecycle, an
-- owner, a mute state and a fan-out join:
--
--   'entity' — many-to-one. N staff watch one (entity_type, entity_id):
--              "notify me about carton 4412".
--   'rule'   — one-to-many. A predicate over a class of events:
--              "notify me on every unbox event for SKU LEN-T480-i5".
--   'sla'    — fires on an ABSENCE. Armed by sla_event_key, disarmed by
--              sla_resolve_event_key, breaches after sla_breach_after:
--              "delivered but not received within 24h". Evaluated by a cron
--              walker, NOT by the event tap — the whole point is that no
--              event arrives.
--
-- WHY REAL COLUMNS FOR THE PREDICATES (match_*), not one jsonb blob:
-- polymorphic-tables.md — "promote queryable business facts to real columns;
-- keep only true variant config in jsonb". Operationally it is what lets the
-- fan-out worker resolve recipients with ONE indexed join per event instead of
-- loading every rule row and evaluating predicates in application code.
-- match_extra JSONB stays for genuinely variant config ONLY — never for
-- anything the worker filters on.
--
-- ENTITY VOCABULARY = the subset of OPS_EVENT_ENTITY_TYPES (src/lib/ops-events.ts)
-- that has a real parent table to hang delete-integrity on. Deliberate gaps,
-- documented per polymorphic-tables.md rule 5 rather than guessed at:
--   • 'shipment'      — ops_events emits it, but there is NO `shipments` table
--                       in this schema (shipment_links is a link table, not a
--                       parent). No trigger is possible; excluded from the
--                       CHECK until a real parent exists.
--   • 'other'         — has no parent by definition. Excluded.
--   • 'ops_plan_task' — ops_plan_tasks.id is UUID; entity_id here is BIGINT per
--                       the polymorphic contract. Home "Tasks" subscriptions
--                       need either a separate uuid column or their own table —
--                       a deliberate follow-up, NOT a silent widening of this
--                       column to TEXT.
--
-- PARENT TABLE MAP (physical names — note the 2026-07-05d spine rename left
-- `receiving` / `receiving_lines` as security_invoker COMPAT VIEWS; a row-level
-- AFTER DELETE trigger cannot live on a view, so these hang on the BASE tables):
--   receiving      → receiving_carton      receiving_line → receiving_line
--   serial_unit    → serial_units          order          → orders
--   fba_shipment   → fba_shipments         repair         → repair_service
--   warranty_claim → warranty_claims
--
-- TENANCY: tenant-from-birth. organization_id UUID NOT NULL with no DEFAULT in
-- the raw DDL; enforce_tenant_isolation() installs the loud-fail GUC default +
-- FORCE RLS + the canonical policy. Safe to enforce immediately because the
-- table has ZERO existing writers — every writer lands in the same PR behind
-- withTenantTransaction(orgId, …) (see the org-scope skill).
--
-- ROLLBACK:
--   select relax_tenant_isolation('staff_subscriptions');
--   drop trigger if exists trg_staff_subs_del_on_<parent>_delete on <parent>;  -- ×7
--   drop function if exists fn_delete_staff_subscriptions_on_parent_delete();
--   drop table if exists staff_subscriptions;
--
-- VERIFY:
--   \d+ staff_subscriptions
--   select conname from pg_constraint where conrelid = 'staff_subscriptions'::regclass;
--   select tgname from pg_trigger where tgname like 'trg_staff_subs_del_%';
--   npm run tenancy:coverage

BEGIN;

CREATE TABLE IF NOT EXISTS staff_subscriptions (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       UUID NOT NULL,          -- NO default; enforce_tenant_isolation() installs it
  staff_id              INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,

  subscription_kind     TEXT NOT NULL,
  -- 'subscribed' = explicit opt-in · 'auto' = implicit (staff acted on it) ·
  -- 'muted' = explicit opt-OUT. Three states, not a boolean: with a boolean the
  -- auto-subscriber re-adds a staffer the moment they touch an entity they just
  -- muted. 'muted' rows are RETAINED precisely so they can suppress auto-adds.
  state                 TEXT NOT NULL DEFAULT 'subscribed',
  -- Why this row exists — renders the "you're receiving this because…" line and
  -- is the per-category mute axis (GitHub's `reason`).
  reason                TEXT NOT NULL DEFAULT 'manual',

  -- ─── kind='entity' ────────────────────────────────────────────────────────
  entity_type           TEXT,
  entity_id             BIGINT,

  -- ─── kind='rule' (predicates; NULL = "don't care about this axis") ────────
  match_event_keys      TEXT[],                 -- exact keys; wildcards expanded at write time
  match_sku             TEXT,
  match_platform        TEXT,
  match_station         TEXT,
  match_severity_min    SMALLINT,
  match_extra           JSONB,                  -- variant config ONLY — never filtered on

  -- ─── kind='sla' ───────────────────────────────────────────────────────────
  sla_event_key         TEXT,                   -- arms the timer
  sla_resolve_event_key TEXT,                   -- disarms it
  sla_breach_after      INTERVAL,               -- fires if not disarmed within this

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Named CHECKs (never an unconstrained discriminator) ────────────────────

DO $$ BEGIN
  ALTER TABLE staff_subscriptions ADD CONSTRAINT staff_subscriptions_kind_chk
    CHECK (subscription_kind IN ('entity','rule','sla'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE staff_subscriptions ADD CONSTRAINT staff_subscriptions_state_chk
    CHECK (state IN ('subscribed','auto','muted'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE staff_subscriptions ADD CONSTRAINT staff_subscriptions_reason_chk
    CHECK (reason IN ('manual','acted','assigned','mentioned','rule','sla'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The discriminator. Values are the parent-backed subset of
-- OPS_EVENT_ENTITY_TYPES — pinned code-side by the notifiable-vocabulary test.
DO $$ BEGIN
  ALTER TABLE staff_subscriptions ADD CONSTRAINT staff_subscriptions_entity_type_chk
    CHECK (entity_type IS NULL OR entity_type IN (
      'receiving','receiving_line','serial_unit','order',
      'fba_shipment','repair','warranty_claim'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Shape gates: each kind must carry the columns its evaluator reads, and must
-- NOT carry another kind's. Without these a half-filled row silently never fires.
DO $$ BEGIN
  ALTER TABLE staff_subscriptions ADD CONSTRAINT staff_subscriptions_entity_shape_chk
    CHECK (
      (subscription_kind =  'entity' AND entity_type IS NOT NULL AND entity_id IS NOT NULL)
   OR (subscription_kind <> 'entity' AND entity_type IS NULL     AND entity_id IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE staff_subscriptions ADD CONSTRAINT staff_subscriptions_rule_shape_chk
    CHECK (
      subscription_kind <> 'rule'
      OR (match_event_keys IS NOT NULL AND array_length(match_event_keys, 1) >= 1)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE staff_subscriptions ADD CONSTRAINT staff_subscriptions_sla_shape_chk
    CHECK (
      subscription_kind <> 'sla'
      OR (sla_event_key IS NOT NULL AND sla_breach_after IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Indexes — every one org-led (never a global unique) ────────────────────

-- One entity subscription per (staff, entity). Partial so rule/sla rows, which
-- have NULL entity columns, are not collapsed into a single row per staffer.
CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_subscriptions_entity
  ON staff_subscriptions (organization_id, staff_id, entity_type, entity_id)
  WHERE subscription_kind = 'entity';

-- Fan-out arm 1: "who watches this exact entity" (the many-to-one join).
CREATE INDEX IF NOT EXISTS idx_staff_subscriptions_entity_lookup
  ON staff_subscriptions (organization_id, entity_type, entity_id)
  WHERE subscription_kind = 'entity' AND state <> 'muted';

-- Fan-out arm 2: "which SKU rules match this event". Partial on live rule rows
-- so the index stays small as muted/entity rows accumulate.
CREATE INDEX IF NOT EXISTS idx_staff_subscriptions_rule_sku
  ON staff_subscriptions (organization_id, match_sku)
  WHERE subscription_kind = 'rule' AND state <> 'muted' AND match_sku IS NOT NULL;

-- Fan-out arm 2b: event-key membership (`$1 = ANY(match_event_keys)`) needs GIN.
CREATE INDEX IF NOT EXISTS idx_staff_subscriptions_rule_event_keys
  ON staff_subscriptions USING GIN (match_event_keys)
  WHERE subscription_kind = 'rule' AND state <> 'muted';

-- SLA walker: the cron evaluator scans armed rules by arming event.
CREATE INDEX IF NOT EXISTS idx_staff_subscriptions_sla
  ON staff_subscriptions (organization_id, sla_event_key)
  WHERE subscription_kind = 'sla' AND state <> 'muted';

-- Settings surface: "my subscriptions", newest first.
CREATE INDEX IF NOT EXISTS idx_staff_subscriptions_staff
  ON staff_subscriptions (organization_id, staff_id, created_at DESC);

-- ─── Parent-delete integrity ────────────────────────────────────────────────
-- polymorphic-tables.md rule 5: a real FK OR a trigger family — never neither.
-- entity_type/entity_id is polymorphic, so it gets the trigger family: ONE
-- generic function dispatching on TG_ARGV[0], one trigger per parent the CHECK
-- can name. All 7 are wired here — shipping a partial family is the
-- work_assignments bug (5 enum values, 2 triggers, 3 silently dead for months).

CREATE OR REPLACE FUNCTION fn_delete_staff_subscriptions_on_parent_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM staff_subscriptions
  WHERE subscription_kind = 'entity'
    AND entity_type = TG_ARGV[0]
    AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

-- NB: receiving/receiving_line hang on the BASE tables (receiving_carton /
-- receiving_line). The legacy `receiving` / `receiving_lines` names are
-- security_invoker compat VIEWS after 2026-07-05d — a view cannot carry a
-- row-level AFTER DELETE trigger.
DROP TRIGGER IF EXISTS trg_staff_subs_del_on_receiving_delete ON receiving_carton;
CREATE TRIGGER trg_staff_subs_del_on_receiving_delete
  AFTER DELETE ON receiving_carton
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_subscriptions_on_parent_delete('receiving');

DROP TRIGGER IF EXISTS trg_staff_subs_del_on_receiving_line_delete ON receiving_line;
CREATE TRIGGER trg_staff_subs_del_on_receiving_line_delete
  AFTER DELETE ON receiving_line
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_subscriptions_on_parent_delete('receiving_line');

DROP TRIGGER IF EXISTS trg_staff_subs_del_on_serial_unit_delete ON serial_units;
CREATE TRIGGER trg_staff_subs_del_on_serial_unit_delete
  AFTER DELETE ON serial_units
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_subscriptions_on_parent_delete('serial_unit');

DROP TRIGGER IF EXISTS trg_staff_subs_del_on_order_delete ON orders;
CREATE TRIGGER trg_staff_subs_del_on_order_delete
  AFTER DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_subscriptions_on_parent_delete('order');

DROP TRIGGER IF EXISTS trg_staff_subs_del_on_fba_shipment_delete ON fba_shipments;
CREATE TRIGGER trg_staff_subs_del_on_fba_shipment_delete
  AFTER DELETE ON fba_shipments
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_subscriptions_on_parent_delete('fba_shipment');

DROP TRIGGER IF EXISTS trg_staff_subs_del_on_repair_delete ON repair_service;
CREATE TRIGGER trg_staff_subs_del_on_repair_delete
  AFTER DELETE ON repair_service
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_subscriptions_on_parent_delete('repair');

DROP TRIGGER IF EXISTS trg_staff_subs_del_on_warranty_claim_delete ON warranty_claims;
CREATE TRIGGER trg_staff_subs_del_on_warranty_claim_delete
  AFTER DELETE ON warranty_claims
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_subscriptions_on_parent_delete('warranty_claim');

-- ─── Tenant-from-birth ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('staff_subscriptions');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — staff_subscriptions left without FORCE RLS';
  END IF;
END $$;

COMMIT;
