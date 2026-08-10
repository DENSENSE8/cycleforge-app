-- ============================================================================
-- 2026-08-10 — view_monitors (watch-a-view: queue-threshold alerts + digests)
--
-- WHAT
--   Durable trigger definitions + runtime state for "watch a saved view / queue".
--   An operator arms a monitor on a queue; a 5-min cron evaluates its current
--   value and fires an edge-triggered alert (breach → recovery) into the existing
--   notification_outbox → staff_inbox_items → Ably pipeline, or throws a task.
--   Plan: docs/todo/view-threshold-alerts-and-digests-IMPLEMENTATION-PLAN.md.
--
-- WHY A DEDICATED TABLE (not an event-subscription row)
--   A view-monitor carries EVALUATION STATE the subscription model has no place
--   for — monitor_state (armed/breached), last_value, breached_at, cooldown —
--   which is what makes hysteresis (fire once on crossing, silence while breached,
--   recovery on clear) possible. `stock_alerts` is the internal precedent for a
--   cron-driven, state-carrying alert table; "one pipeline" is reused for
--   DELIVERY (outbox/inbox/Ably), not for the trigger table.
--
-- DECISION B — SNAPSHOT, NOT FK DEPENDENCY
--   monitor_surface + monitor_params are a SNAPSHOT of the watched view's params
--   at arm time. source_view_id is INFORMATIONAL ONLY (ON DELETE SET NULL): the
--   evaluator reads the snapshot and never joins source_view_id, so renaming or
--   deleting the personal saved view never breaks the watch (P7). Mirrors how
--   saved_views already persists params as an opaque JSONB bag.
--
-- TENANT-FROM-BIRTH / FORCE RLS
--   organization_id NOT NULL (no DDL default; the helper installs the loud-fail
--   GUC default) + enforce_tenant_isolation('view_monitors') in the same
--   migration. SAFE to FORCE now: this table has ZERO writers at apply time (the
--   arm API is Phase 3, the cron is Phase 2), so no code path can loud-fail. When
--   writers land they MUST run under withTenantTransaction (which sets
--   app.current_org so the org default stamps) or pass organization_id explicitly
--   — including the session-less per-tenant cron, which loops with the GUC set.
--   Reference: saved_views (2026-07-29g) — FORCE from birth.
--
-- ROLLBACK (dev only)
--   SELECT relax_tenant_isolation('view_monitors');
--   DROP TABLE IF EXISTS view_monitors CASCADE;
--
-- VERIFY
--   \d view_monitors                       -- columns + the three named CHECKs
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE relname = 'view_monitors';       -- both t after enforce
--
-- Ordering law: expand → code → contract. This migration lands + applies FIRST;
-- the Drizzle model + code referencing these columns come SECOND
-- (column-reference.guard.test.ts).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS view_monitors (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL,   -- no DDL default; enforce_tenant_isolation installs the loud-fail GUC default
  -- Owner = recipient (personal-only MVP: self-notify). Shared-to-role is the
  -- sibling "role/shift view assignment" project, not this table.
  staff_id          INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  -- Informational back-link to the saved view this monitor was armed from.
  -- Decision B: SNAPSHOT, not dependency — ON DELETE SET NULL, never joined to
  -- resolve a value.
  source_view_id    BIGINT REFERENCES saved_views(id) ON DELETE SET NULL,

  -- ── Snapshot of the watched view at arm time (what the resolver evaluates) ──
  monitor_surface   TEXT NOT NULL,
  monitor_params    JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- ── Trigger definition ──
  -- CHECK view_monitors_threshold_type_chk (below).
  threshold_type    TEXT NOT NULL,
  threshold_value   NUMERIC,          -- NULL for scheduled_digest (no threshold)
  recovery_value    NUMERIC,          -- NULL → recovery relies on cooldown_interval only
  cooldown_interval INTERVAL,         -- NULL → recovery relies on recovery_value only
  -- CHECK view_monitors_action_type_chk (below).
  action_type       TEXT NOT NULL,
  cadence           TEXT,             -- NULL except scheduled_digest

  -- ── Runtime state (edge-trigger hysteresis) ──
  -- CHECK view_monitors_state_chk (below).
  monitor_state     TEXT NOT NULL DEFAULT 'armed',
  last_value        NUMERIC,
  last_evaluated_at TIMESTAMPTZ,
  breached_at       TIMESTAMPTZ,
  last_fired_at     TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Named CHECKs, idempotent (redefine the FULL set, never append — see
-- polymorphic-tables.md § discriminator).
DO $$ BEGIN
  ALTER TABLE view_monitors ADD CONSTRAINT view_monitors_threshold_type_chk
    CHECK (threshold_type IN ('count_above', 'count_below', 'item_aging', 'scheduled_digest'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE view_monitors ADD CONSTRAINT view_monitors_action_type_chk
    CHECK (action_type IN ('inbox_notification', 'throw_task'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE view_monitors ADD CONSTRAINT view_monitors_state_chk
    CHECK (monitor_state IN ('armed', 'breached'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Org-led index for the per-tenant cron scan + the operator's "Watched" list.
CREATE INDEX IF NOT EXISTS idx_view_monitors_org_staff
  ON view_monitors (organization_id, staff_id);

-- Partial index: the recovery pass scans only currently-breached monitors.
CREATE INDEX IF NOT EXISTS idx_view_monitors_breached
  ON view_monitors (organization_id) WHERE monitor_state = 'breached';

-- Flip on FORCE RLS + loud-fail org default + canonical tenant_isolation policy.
-- Guarded so a fresh DB without the helper still gets the table. Safe to enforce
-- now: zero writers at apply time (see header).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('view_monitors');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — view_monitors left without FORCE RLS';
  END IF;
END $$;

COMMENT ON TABLE view_monitors IS
  'Watch-a-view: cron-evaluated, edge-triggered queue-threshold alerts + digests. Snapshots the watched view params (decision B); emits into notification_outbox/staff_inbox_items.';

COMMIT;
