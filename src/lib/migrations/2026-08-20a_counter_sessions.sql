-- 2026-08-20a_counter_sessions.sql
--
-- counter_sessions / counter_session_lines — the shared desk↔iPad cart.
--
-- Plan: docs/todo/kiosk-desk-session-channel-PLAN.md (P1 · D1 · D3 · D4 · D8 · D9).
--
-- WHY THIS TABLE EXISTS AT ALL. Today the kiosk cart is a module-scoped
-- singleton in ONE browser tab (src/lib/kiosk/kiosk-session-store.ts), and the
-- customer face is a view over that same in-memory snapshot — which is why the
-- "customer display" only works when it is the same device flipping faces. A
-- desk and a tablet cannot hold one cart without a copy that outlives both
-- tabs. Ably carries change NOTIFICATIONS; it is not where the cart lives (D1).
--
-- TWO TABLES, because they answer two different questions:
--   counter_sessions      — WHOSE visit this is, who holds it, what version
--   counter_session_lines — WHAT is staged, one row per line so a line is a
--                           real CRUD target rather than a jsonb blob rewrite
--
-- NOT A SECOND counter_transactions. That header is the FINANCIAL + WORK
-- record a completed visit produces (2026-07-29d, plan D1: never one mixed-line
-- order). This is the DRAFT that precedes it — it exists while the customer is
-- standing there, and hands off exactly once via counter_transaction_id. A
-- session is short-lived and edited constantly; a transaction is written once
-- and kept. Folding the draft into the header would put every keystroke of a
-- staged cart into the table that money reconciles against.
--
-- VERSION IS THE WHOLE CONCURRENCY MODEL (D3). `version` is monotonic per
-- session; every accepted mutation bumps it by exactly one, and a client
-- applies an event only when it is `version + 1` (see applySessionEvent in
-- src/lib/counter/session-events.ts). A client that mismatches refetches the
-- snapshot. No CRDT: this is 1–8 lines with one human on each end, where
-- last-writer-wins plus a VISIBLE refetch is honest and debuggable. The repo
-- does run Yjs (forge:master-plan) — deliberately not reached for here.
--
-- ONE OPEN SESSION PER DEVICE, ENFORCED IN THE DB. ux_counter_sessions_open_device
-- is a partial unique index over (organization_id, kiosk_device_id) WHERE
-- status = 'open'. D4's "one on one" has to survive two managers opening the
-- same counter on two desktops; silent multi-claim is how POS systems
-- double-charge. An invariant that important does not live only in app code.
--
-- VOIDING IS SOFT, AND THERE IS ONE VERB FOR IT. voided_at / void_reason /
-- voided_by_staff_id, never a DELETE: a line the customer already saw on the
-- display is evidence. The device-facing projection drops voided lines (D6);
-- the desk ledger keeps them struck through.
--
-- FK CHOICES, and why kiosk_device_id differs from the one on
-- counter_transactions:
--   * counter_transactions.kiosk_device_id is deliberately NOT a FK — it is an
--     AUDIT fact ("which device took the money") that must outlive revocation.
--   * counter_sessions.kiosk_device_id IS a FK with ON DELETE SET NULL — it is
--     live ROUTING ("which tablet is bound right now"), and a device that is
--     gone should release its binding rather than pin a dead session open.
--     The audit fact still lands on the transaction header at submit.
--   * counter_transaction_id is ON DELETE SET NULL, never CASCADE. Same law as
--     the parent plan: deleting a header must never delete the record of the
--     visit that produced it.
--   * counter_session_lines.session_id IS ON DELETE CASCADE — a line has no
--     meaning without its session, and nothing financial or legal lives here
--     (the signed agreement is a `documents` row hung off the repair).
--
-- LINE TYPES ARE THE THREE IN CODE. RETAIL | REPAIR | BUYBACK — the exact set
-- in KIOSK_LINE_TYPES (src/lib/kiosk/cart-line.ts). PICKUP is a kiosk COMMAND
-- (which pane is on screen), never a cart line type; putting it in this CHECK
-- would let a pane selection be persisted as a chargeable row.
--
-- TENANCY: tenant-from-birth. organization_id UUID NOT NULL with no DEFAULT in
-- the raw DDL; enforce_tenant_isolation() installs the loud-fail GUC default,
-- FORCE RLS and the canonical policy. Safe immediately — both tables have zero
-- existing writers; every writer lands later behind withTenantTransaction.
--
-- EXPAND-FIRST: this migration lands BEFORE any code reads it
-- (.claude/rules/backend-patterns.md). The Drizzle model ships in this same PR.
--
-- ROLLBACK:
--   select relax_tenant_isolation('counter_session_lines');
--   select relax_tenant_isolation('counter_sessions');
--   drop table if exists counter_session_lines;
--   drop table if exists counter_sessions;
--
-- VERIFY:
--   \d+ counter_sessions
--   \d+ counter_session_lines
--   npm run tenancy:coverage

BEGIN;

-- ── Session header ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS counter_sessions (
  id                     BIGSERIAL PRIMARY KEY,
  organization_id        UUID NOT NULL,             -- NO default; enforce_tenant_isolation installs it

  -- Live routing: which paired tablet this session is bound to. NULL = desk-only.
  kiosk_device_id        BIGINT REFERENCES kiosk_devices(id) ON DELETE SET NULL,

  -- The lease (D4). A desk CLAIMS a device; the claim is heartbeat-renewed and
  -- expires, so a closed laptop releases the counter instead of holding it.
  claimed_by_staff_id    INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  claim_expires_at       TIMESTAMPTZ,

  status                 TEXT NOT NULL DEFAULT 'open',    -- CHECK below
  -- Monotonic; bumped by exactly one per accepted mutation. Clients apply an
  -- event only at version + 1 (D3).
  version                INTEGER NOT NULL DEFAULT 0,

  active_command         TEXT NOT NULL DEFAULT 'retail',  -- CHECK below (which pane)
  face                   TEXT NOT NULL DEFAULT 'staff',   -- CHECK below (which face the tablet shows)

  -- Deterministic identity only (parent plan D7): phone unlocks create-or-match.
  -- There is no searchable customer list on an unattended tablet.
  customer_phone         TEXT,
  customer_name          TEXT,
  customer_email         TEXT,

  -- Idempotency anchor for the eventual submit. Minted when the session opens
  -- so it outlives the tab: a resumed park and a retried submit carry the same
  -- id, and ux_counter_transactions_client_event turns a replay into a no-op
  -- instead of a second charge.
  client_event_id        UUID NOT NULL,
  counter_transaction_id BIGINT REFERENCES counter_transactions(id) ON DELETE SET NULL,

  submitted_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT counter_sessions_version_nonneg CHECK (version >= 0)
);

DO $$ BEGIN
  ALTER TABLE counter_sessions ADD CONSTRAINT counter_sessions_status_chk
    CHECK (status IN ('open', 'parked', 'submitted', 'voided'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE counter_sessions ADD CONSTRAINT counter_sessions_active_command_chk
    CHECK (active_command IN ('retail', 'repair', 'buyback', 'pickup'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE counter_sessions ADD CONSTRAINT counter_sessions_face_chk
    CHECK (face IN ('staff', 'customer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Idempotency anchor, org-led (never a global unique on the client's uuid).
CREATE UNIQUE INDEX IF NOT EXISTS ux_counter_sessions_client_event
  ON counter_sessions (organization_id, client_event_id);

-- D4, in the DB: at most ONE open session per bound tablet.
CREATE UNIQUE INDEX IF NOT EXISTS ux_counter_sessions_open_device
  ON counter_sessions (organization_id, kiosk_device_id)
  WHERE status = 'open' AND kiosk_device_id IS NOT NULL;

-- The parked list, and the desk's "my open counters" query.
CREATE INDEX IF NOT EXISTS idx_counter_sessions_org_status_updated
  ON counter_sessions (organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_counter_sessions_org_claimed_staff
  ON counter_sessions (organization_id, claimed_by_staff_id)
  WHERE claimed_by_staff_id IS NOT NULL;

-- ── Staged lines ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS counter_session_lines (
  id                 BIGSERIAL PRIMARY KEY,
  organization_id    UUID NOT NULL,                 -- NO default; enforce_tenant_isolation installs it
  session_id         BIGINT NOT NULL REFERENCES counter_sessions(id) ON DELETE CASCADE,

  -- The client-minted KioskCartLine.id. The line keeps ONE identity from the
  -- moment it is staged on either device through to the ledger, so an optimistic
  -- local echo and the server's row are provably the same line rather than two.
  line_uuid          UUID NOT NULL,

  type               TEXT NOT NULL,                 -- CHECK below: RETAIL | REPAIR | BUYBACK
  title              TEXT NOT NULL,
  quantity           INTEGER NOT NULL DEFAULT 1,
  -- Minor units. NEGATIVE = buyback / trade-in credit — do not clamp to >= 0
  -- here or in the totals math; that clamp silently ate trade-in credits once
  -- already (see computeCounterTotals).
  unit_amount_cents  INTEGER NOT NULL,
  -- True variant config only (repair reasons, serial, imei, signature ref).
  -- Queryable business facts stay real columns above (polymorphic-tables.md).
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_index         INTEGER NOT NULL DEFAULT 0,

  -- Soft void: a line the customer saw is evidence, not a delete.
  voided_at          TIMESTAMPTZ,
  void_reason        TEXT,
  voided_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT counter_session_lines_quantity_pos CHECK (quantity > 0)
);

DO $$ BEGIN
  ALTER TABLE counter_session_lines ADD CONSTRAINT counter_session_lines_type_chk
    CHECK (type IN ('RETAIL', 'REPAIR', 'BUYBACK'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per client line id, org-led.
CREATE UNIQUE INDEX IF NOT EXISTS ux_counter_session_lines_line_uuid
  ON counter_session_lines (organization_id, session_id, line_uuid);

-- The ledger read: every line of a session, in display order.
CREATE INDEX IF NOT EXISTS idx_counter_session_lines_session_sort
  ON counter_session_lines (session_id, sort_index);

-- ── Tenant-from-birth ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('counter_sessions');
    PERFORM enforce_tenant_isolation('counter_session_lines');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — counter_sessions / counter_session_lines left without FORCE RLS';
  END IF;
END $$;

COMMIT;
