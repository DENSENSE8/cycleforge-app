-- ============================================================================
-- 2026-07-14: entity_threads + thread_messages — ticket-optional, entity-
-- anchored conversation pair (docs/todo/entity-threads-conversation-plan.md
-- Phase 0, decisions D1/D2/D6)
-- ============================================================================
-- One entity_threads row = one conversation anchored to a canonical entity via
-- the ratified polymorphic (entity_type, entity_id) anchor; thread_messages
-- holds the provider-agnostic bodies. A thread exists BEFORE any support
-- ticket; the nullable support_ticket_id is the later attach seam (D6 —
-- ticket_links untouched). Message inserts also emit an ops_events row
-- (event_type='THREAD_MESSAGE') from the writing helper (src/lib/threads/,
-- Phase 1) — mirrors recordEntitySignal's emission; the spine stays the SoT
-- timeline.
--
-- Contract: .claude/rules/polymorphic-tables.md. Golden sibling:
-- 2026-07-03l_entity_signals.sql (same 7 confirmed parents, same
-- dispatch-on-TG_ARGV[0] delete-trigger family).
--   • entity_type — named CHECK, the 7-value UPPERCASE vocab from
--     SURFACE_ENTITY_TYPES (src/lib/surfaces/registry.ts). Byte-identical with
--     entity_signals_entity_type_chk / feed_memberships. Adding a value =
--     CHECK redefinition + delete trigger + registry entry, one migration.
--   • entity_id — BIGINT (D2). ORDER anchors the legacy `orders` marketplace
--     mirror (INTEGER PK), same as entity_signals.
--   • status / provider / visibility — small governed vocabs, named CHECKs.
--   • thread_messages.thread_id — real FK ON DELETE CASCADE (single
--     non-polymorphic parent); polymorphic integrity lives on entity_threads'
--     trigger family, messages cascade through the FK.
--   • Parent-existence validation is app-side (contract point 6):
--     getOrCreateThread validates the parent row exists before insert.
--
-- entity_notes backfill: DELIBERATELY SKIPPED (documented gap per contract).
-- entity_notes.entity_id is UUID — Postgres has no uuid→bigint cast, so a
-- mapping INSERT cannot even parse — and its only writer
-- (salesOrderRepository.ts) only ever stamps entity_type='sales_order'
-- (UUID-keyed sales_orders), which is not one of the 7 canonical parents.
-- Zero rows are mappable; entity_notes is superseded by READ (no UI reads it
-- today), left in place, not dropped.
--
-- Safety gating: brand-new tables, zero writers at author time. The only
-- writers (src/lib/threads/, Phase 1) stamp organization_id and run under
-- withTenantTransaction → tenant-from-birth enforcement is safe. RLS is inert
-- under neondb_owner (BYPASSRLS); the loud-fail GUC default is the immediate
-- backstop.
--
-- ROLLBACK (function first WITH CASCADE — the 7 triggers live on the parents):
--   select relax_tenant_isolation('thread_messages');
--   select relax_tenant_isolation('entity_threads');
--   DROP FUNCTION IF EXISTS fn_delete_entity_threads_on_parent_delete() CASCADE;
--   DROP TABLE IF EXISTS thread_messages;
--   DROP TABLE IF EXISTS entity_threads;
--
-- VERIFY (after apply): npm run tenancy:coverage
-- ============================================================================

BEGIN;

-- ── entity_threads: one ticket-optional conversation per entity (v1) ─────────
CREATE TABLE IF NOT EXISTS entity_threads (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL,          -- no DEFAULT; enforce_tenant_isolation() installs it
  entity_type       TEXT NOT NULL,          -- named CHECK below (7 UPPERCASE values)
  entity_id         BIGINT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',       -- named CHECK below
  support_ticket_id BIGINT REFERENCES support_tickets(id) ON DELETE SET NULL,  -- D6 attach seam; NULL = ticketless
  last_message_at   TIMESTAMPTZ,            -- denormalized by postThreadMessage for rail sort
  created_by        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE entity_threads ADD CONSTRAINT entity_threads_entity_type_chk
    CHECK (entity_type IN ('RECEIVING','RECEIVING_LINE','SERIAL_UNIT','ORDER','FBA_SHIPMENT','REPAIR','WARRANTY_CLAIM'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE entity_threads ADD CONSTRAINT entity_threads_status_chk
    CHECK (status IN ('open','snoozed','resolved'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One thread per entity (v1) — org-led natural key. Doubles as the point-
-- lookup index for (org, entity_type, entity_id), so no second index needed.
CREATE UNIQUE INDEX IF NOT EXISTS ux_entity_threads_natural
  ON entity_threads (organization_id, entity_type, entity_id);

-- Rail sort: "most recently active conversations" per org.
CREATE INDEX IF NOT EXISTS idx_entity_threads_org_last_message
  ON entity_threads (organization_id, last_message_at DESC NULLS LAST, id DESC);

-- Attached-ticket reverse lookup (Phase 6 header chip / support console).
CREATE INDEX IF NOT EXISTS idx_entity_threads_support_ticket
  ON entity_threads (support_ticket_id)
  WHERE support_ticket_id IS NOT NULL;

COMMENT ON TABLE entity_threads IS
  'Ticket-optional conversation anchored to a canonical entity (docs/todo/entity-threads-conversation-plan.md). entity_type CHECK mirrors SURFACE_ENTITY_TYPES (src/lib/surfaces/registry.ts); one thread per (org, entity_type, entity_id) in v1; support_ticket_id = later Zendesk/internal attach seam (ticket_links untouched). Tenant-scoped from birth.';

-- ── thread_messages: provider-agnostic bodies ────────────────────────────────
CREATE TABLE IF NOT EXISTS thread_messages (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,            -- no DEFAULT; enforce_tenant_isolation() installs it
  thread_id       BIGINT NOT NULL REFERENCES entity_threads(id) ON DELETE CASCADE,
  author_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,  -- NULL = provider-mirrored / system
  provider        TEXT NOT NULL DEFAULT 'internal',   -- named CHECK below
  visibility      TEXT NOT NULL DEFAULT 'internal',   -- named CHECK below; mirrors Zendesk internal-note vs public-reply
  body            TEXT NOT NULL,
  client_event_id TEXT,                     -- idempotency (partial unique below)
  meta            JSONB,                    -- photo refs, cc, external ids
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_provider_chk
    CHECK (provider IN ('internal','zendesk','system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_visibility_chk
    CHECK (visibility IN ('internal','public'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_body_chk
    CHECK (length(btrim(body)) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Client-retry idempotency: a flaky-network re-POST with the same
-- clientEventId is a no-op (postThreadMessage returns idempotent: true).
CREATE UNIQUE INDEX IF NOT EXISTS ux_thread_messages_client_event
  ON thread_messages (organization_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

-- Per-thread pagination (listThreadMessages keyset: created_at, id).
CREATE INDEX IF NOT EXISTS idx_thread_messages_thread
  ON thread_messages (thread_id, created_at DESC, id DESC);

COMMENT ON TABLE thread_messages IS
  'Bodies for entity_threads. provider internal|zendesk|system; visibility internal|public (Zendesk note vs reply parity). Every insert also emits ops_events event_type=THREAD_MESSAGE via postThreadMessage (src/lib/threads/). Idempotent on (org, client_event_id). Tenant-scoped from birth.';

-- ── Parent-delete integrity: cascade threads (messages cascade via FK) ───────
--    Same 7 confirmed parents as entity_signals; no skips.
CREATE OR REPLACE FUNCTION fn_delete_entity_threads_on_parent_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM entity_threads
  WHERE entity_type = TG_ARGV[0]
    AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_entity_threads_on_receiving_delete ON receiving;
CREATE TRIGGER trg_delete_entity_threads_on_receiving_delete
AFTER DELETE ON receiving
FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_threads_on_parent_delete('RECEIVING');

DROP TRIGGER IF EXISTS trg_delete_entity_threads_on_receiving_line_delete ON receiving_lines;
CREATE TRIGGER trg_delete_entity_threads_on_receiving_line_delete
AFTER DELETE ON receiving_lines
FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_threads_on_parent_delete('RECEIVING_LINE');

DROP TRIGGER IF EXISTS trg_delete_entity_threads_on_serial_unit_delete ON serial_units;
CREATE TRIGGER trg_delete_entity_threads_on_serial_unit_delete
AFTER DELETE ON serial_units
FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_threads_on_parent_delete('SERIAL_UNIT');

DROP TRIGGER IF EXISTS trg_delete_entity_threads_on_order_delete ON orders;
CREATE TRIGGER trg_delete_entity_threads_on_order_delete
AFTER DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_threads_on_parent_delete('ORDER');

DROP TRIGGER IF EXISTS trg_delete_entity_threads_on_fba_shipment_delete ON fba_shipments;
CREATE TRIGGER trg_delete_entity_threads_on_fba_shipment_delete
AFTER DELETE ON fba_shipments
FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_threads_on_parent_delete('FBA_SHIPMENT');

DROP TRIGGER IF EXISTS trg_delete_entity_threads_on_repair_service_delete ON repair_service;
CREATE TRIGGER trg_delete_entity_threads_on_repair_service_delete
AFTER DELETE ON repair_service
FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_threads_on_parent_delete('REPAIR');

DROP TRIGGER IF EXISTS trg_delete_entity_threads_on_warranty_claim_delete ON warranty_claims;
CREATE TRIGGER trg_delete_entity_threads_on_warranty_claim_delete
AFTER DELETE ON warranty_claims
FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_threads_on_parent_delete('WARRANTY_CLAIM');

-- ── Tenant-from-birth enforcement (both tables) ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('entity_threads');
    PERFORM enforce_tenant_isolation('thread_messages');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — entity_threads/thread_messages left without FORCE RLS';
  END IF;
END $$;

COMMIT;
