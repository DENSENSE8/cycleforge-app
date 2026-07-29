-- 2026-07-28d_notification_outbox_and_staff_inbox_items.sql
--
-- The delivery half of the Home subscription engine
-- (docs/todo/home-triage-subscriptions-*.md). Runs AFTER 2026-07-28c —
-- staff_inbox_items FKs staff_subscriptions(id).
--
--   ops_events ──trigger──▶ notification_outbox ──cron worker──▶ staff_inbox_items
--                                                                      │
--                                                          Ably org:{org}:inbox:{staff}
--
-- Two tables, two jobs:
--
--   notification_outbox — one row per ops_event, org-scoped, drained by a cron
--     worker. Mirrors entity_search_outbox (2026-07-03d + the 2026-07-04a claim
--     window) so there is one outbox pattern in this codebase, not two.
--
--   staff_inbox_items — the per-recipient ledger the Inbox renders. Deliberately
--     NOT staff_messages: that table is the human DM store (sender_id NOT NULL
--     REFERENCES staff — a system notification has no sender; body TEXT NOT NULL
--     — prerendered text goes stale when the entity changes; no entity anchor —
--     collapse would be unindexable; no dedupe key — an at-least-once worker
--     would double-deliver on every retry). Two genuinely different jobs get
--     sibling tables, per AGENTS.md.
--
-- WHY THE TRIGGER ENQUEUES *EVERY* ops_event, with no DB-side "notifiable" flag:
-- a notifiable-event list living in DDL drifts from the code SoT the moment
-- someone adds an event key, and the drift is silent (the notification simply
-- never fires). Instead the trigger is dumb and the WORKER filters against the
-- code SoT derived from ops_events.event_type + SIGNAL_KINDS, marking
-- non-notifiable rows processed immediately. One vocabulary, one place, no
-- pinning test needed for a second copy. Cost is a few thousand cheap rows/day,
-- pruned by the same retention sweep as entity_search_outbox.
--
-- LEDGER SHAPE is ActivityStreams-2.0-flavored: store a structured reference
-- (entity_type/entity_id/event_key/actor) and render at READ time. Never
-- prerender the message body at write time.
--
-- DEDUPE vs COLLAPSE — two different jobs, two different keys:
--   dedup_key   — idempotency. Same (org, staff, dedup_key) can only ever exist
--                 once, so a worker retry after a crash is a no-op. Built from
--                 the source event's client_event_id when present, else
--                 ops_event_id. ORG-LED unique — a global unique on dedup_key
--                 would let org A's row silently swallow org B's notification.
--   collapse_key — fatigue. Related events on the same parent inside a debounce
--                 window fold into ONE row with collapse_count/last_event_at
--                 ("12× unbox scans on carton 4412"). Keyed on the CARTON, not
--                 the line, so a 200-line PO receive produces one inbox row per
--                 watcher rather than 200.
--
-- TENANCY: both tables tenant-from-birth (organization_id NOT NULL, no DEFAULT
-- in the raw DDL; enforce_tenant_isolation installs it). Zero existing writers,
-- so enforcing immediately is safe. The cron drain runs on the owner pool
-- (BYPASSRLS) for the cross-org claim/mark, exactly like search-outbox-worker;
-- all per-recipient writes are org-scoped.
--
-- ROLLBACK:
--   select relax_tenant_isolation('staff_inbox_items');
--   select relax_tenant_isolation('notification_outbox');
--   drop trigger if exists trg_enqueue_notification_outbox_on_ops_events on ops_events;
--   drop function if exists fn_enqueue_notification_outbox();
--   drop trigger if exists trg_inbox_del_on_<parent>_delete on <parent>;  -- ×7
--   drop function if exists fn_delete_staff_inbox_items_on_parent_delete();
--   drop table if exists staff_inbox_items;
--   drop table if exists notification_outbox;
--
-- VERIFY:
--   \d+ notification_outbox   \d+ staff_inbox_items
--   select tgname from pg_trigger where tgname like 'trg_inbox_del_%'
--                                    or tgname = 'trg_enqueue_notification_outbox_on_ops_events';
--   npm run tenancy:coverage

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- notification_outbox
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_outbox (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,          -- NO default; enforce_tenant_isolation() installs it
  -- Source event. FK-free on purpose: ops_events is append-only and never
  -- deleted, and a FK here would make the outbox a blocker on any future
  -- retention prune of that table.
  ops_event_id    BIGINT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       BIGINT NOT NULL,
  event_key       TEXT NOT NULL,          -- ops_events.event_type at enqueue time
  actor_staff_id  INTEGER,                -- who caused it (suppress self-notification)
  client_event_id TEXT,                   -- carried through to dedup_key when present
  -- Copied from ops_events.payload. The worker reads the collapse PARENT id out
  -- of it (e.g. payload.receivingId on a line event) so line churn folds onto
  -- the carton; without it a 200-line receive is 200 inbox rows per watcher.
  payload         JSONB,
  occurred_at     TIMESTAMPTZ NOT NULL,   -- the EVENT's time, never now()
  enqueued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at      TIMESTAMPTZ,            -- claim window (2026-07-04a pattern)
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  processed_at    TIMESTAMPTZ
);

-- Idempotent enqueue: one outbox row per source event, per org. A trigger
-- double-fire or a replayed insert is a no-op rather than a duplicate fan-out.
CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_outbox_event
  ON notification_outbox (organization_id, ops_event_id);

-- Drain scan: the worker reads pending rows in id order.
CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
  ON notification_outbox (id)
  WHERE processed_at IS NULL;

-- Retention sweep (/api/cron/cleanup prunes processed rows), same shape as
-- entity_search_outbox so one sweep pattern covers both.
CREATE INDEX IF NOT EXISTS idx_notification_outbox_processed
  ON notification_outbox (processed_at)
  WHERE processed_at IS NOT NULL;

-- Dumb enqueue — the worker owns the notifiable-vocabulary decision (see header).
CREATE OR REPLACE FUNCTION fn_enqueue_notification_outbox()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;  -- no tenant to deliver under
  END IF;
  INSERT INTO notification_outbox (
    organization_id, ops_event_id, entity_type, entity_id,
    event_key, actor_staff_id, client_event_id, payload, occurred_at
  )
  VALUES (
    NEW.organization_id, NEW.id, NEW.entity_type, NEW.entity_id,
    NEW.event_type, NEW.actor_staff_id, NEW.client_event_id, NEW.payload, NEW.occurred_at
  )
  ON CONFLICT (organization_id, ops_event_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_notification_outbox_on_ops_events ON ops_events;
CREATE TRIGGER trg_enqueue_notification_outbox_on_ops_events
  AFTER INSERT ON ops_events
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_notification_outbox();

-- ════════════════════════════════════════════════════════════════════════════
-- staff_inbox_items
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff_inbox_items (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,          -- NO default; enforce_tenant_isolation() installs it
  staff_id        INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: unsubscribing must not erase the history of what you
  -- were already told. The row survives, orphaned but explicable via `reason`.
  subscription_id BIGINT REFERENCES staff_subscriptions(id) ON DELETE SET NULL,

  -- ─── Structured reference (rendered at read time; never prerendered text) ──
  entity_type     TEXT NOT NULL,
  entity_id       BIGINT NOT NULL,
  event_key       TEXT NOT NULL,
  actor_staff_id  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  reason          TEXT NOT NULL,          -- why this landed in YOUR inbox
  payload         JSONB,                  -- render hints only; never filtered on

  -- ─── Idempotency + fatigue ────────────────────────────────────────────────
  dedup_key       TEXT NOT NULL,
  collapse_key    TEXT NOT NULL,
  collapse_count  INTEGER NOT NULL DEFAULT 1,

  -- ─── Triage: 4 states, because Unread and Done are different axes ─────────
  state           TEXT NOT NULL DEFAULT 'unread',
  snoozed_until   TIMESTAMPTZ,

  occurred_at     TIMESTAMPTZ NOT NULL,   -- the EVENT's time (orders the feed)
  last_event_at   TIMESTAMPTZ NOT NULL,   -- newest event folded into this row
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE staff_inbox_items ADD CONSTRAINT staff_inbox_items_entity_type_chk
    CHECK (entity_type IN (
      'receiving','receiving_line','serial_unit','order',
      'fba_shipment','repair','warranty_claim'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE staff_inbox_items ADD CONSTRAINT staff_inbox_items_state_chk
    CHECK (state IN ('unread','read','done','snoozed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE staff_inbox_items ADD CONSTRAINT staff_inbox_items_reason_chk
    CHECK (reason IN ('manual','acted','assigned','mentioned','rule','sla'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A snoozed row must say until when, or it never comes back.
DO $$ BEGIN
  ALTER TABLE staff_inbox_items ADD CONSTRAINT staff_inbox_items_snooze_chk
    CHECK (state <> 'snoozed' OR snoozed_until IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Indexes — org-led throughout ───────────────────────────────────────────

-- Idempotency. ORG-LED (and staff-led): a global unique on dedup_key would let
-- one tenant's row silently suppress another tenant's notification.
CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_inbox_items_dedup
  ON staff_inbox_items (organization_id, staff_id, dedup_key);

-- Collapse target: the worker looks for an open row on the same parent inside
-- the debounce window before inserting a new one.
CREATE INDEX IF NOT EXISTS idx_staff_inbox_items_collapse
  ON staff_inbox_items (organization_id, staff_id, collapse_key, last_event_at DESC)
  WHERE state IN ('unread','read');

-- The Inbox read path: my active items, newest first.
CREATE INDEX IF NOT EXISTS idx_staff_inbox_items_feed
  ON staff_inbox_items (organization_id, staff_id, state, occurred_at DESC, id DESC);

-- Snooze walker: the cron that flips expired snoozes back to unread.
CREATE INDEX IF NOT EXISTS idx_staff_inbox_items_snoozed
  ON staff_inbox_items (organization_id, snoozed_until)
  WHERE state = 'snoozed';

-- "Everything about this entity" — powers the per-entity subscriber peek and
-- the read-time permission filter's entity join.
CREATE INDEX IF NOT EXISTS idx_staff_inbox_items_entity
  ON staff_inbox_items (organization_id, entity_type, entity_id, occurred_at DESC);

-- ─── Parent-delete integrity (same 7-parent family as staff_subscriptions) ──
-- A deleted carton must not leave undeleteable inbox rows pointing at it.

CREATE OR REPLACE FUNCTION fn_delete_staff_inbox_items_on_parent_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM staff_inbox_items
  WHERE entity_type = TG_ARGV[0]
    AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_inbox_del_on_receiving_delete ON receiving_carton;
CREATE TRIGGER trg_inbox_del_on_receiving_delete
  AFTER DELETE ON receiving_carton
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_inbox_items_on_parent_delete('receiving');

DROP TRIGGER IF EXISTS trg_inbox_del_on_receiving_line_delete ON receiving_line;
CREATE TRIGGER trg_inbox_del_on_receiving_line_delete
  AFTER DELETE ON receiving_line
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_inbox_items_on_parent_delete('receiving_line');

DROP TRIGGER IF EXISTS trg_inbox_del_on_serial_unit_delete ON serial_units;
CREATE TRIGGER trg_inbox_del_on_serial_unit_delete
  AFTER DELETE ON serial_units
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_inbox_items_on_parent_delete('serial_unit');

DROP TRIGGER IF EXISTS trg_inbox_del_on_order_delete ON orders;
CREATE TRIGGER trg_inbox_del_on_order_delete
  AFTER DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_inbox_items_on_parent_delete('order');

DROP TRIGGER IF EXISTS trg_inbox_del_on_fba_shipment_delete ON fba_shipments;
CREATE TRIGGER trg_inbox_del_on_fba_shipment_delete
  AFTER DELETE ON fba_shipments
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_inbox_items_on_parent_delete('fba_shipment');

DROP TRIGGER IF EXISTS trg_inbox_del_on_repair_delete ON repair_service;
CREATE TRIGGER trg_inbox_del_on_repair_delete
  AFTER DELETE ON repair_service
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_inbox_items_on_parent_delete('repair');

DROP TRIGGER IF EXISTS trg_inbox_del_on_warranty_claim_delete ON warranty_claims;
CREATE TRIGGER trg_inbox_del_on_warranty_claim_delete
  AFTER DELETE ON warranty_claims
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_inbox_items_on_parent_delete('warranty_claim');

-- ─── Tenant-from-birth ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('notification_outbox');
    PERFORM enforce_tenant_isolation('staff_inbox_items');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — notification_outbox/staff_inbox_items left without FORCE RLS';
  END IF;
END $$;

COMMIT;
