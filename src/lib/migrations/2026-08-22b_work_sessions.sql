-- 2026-08-22b_work_sessions.sql
--
-- work_sessions — the root object of the Warehouse-OS shell.
--
-- Plan: docs/warehouse-os/02-target-architecture.md §2 · 04-roadmap.md Phase 2.
--
-- WHAT A SESSION IS. A unit of human work, of exactly one KIND:
--
--   kind = 'scan'  → carries a scan_type. EXACTLY ONE armed per org, app-wide.
--   kind = 'task'  → carries no scan_type. N may be open at once.
--
-- That two-value discriminator is the whole scan-ownership model (D7). The
-- global wedge listener routes every scan to THE ONE ARMED SCAN SESSION, so
-- tiles never compete for a barcode: there is no scanFocusTileId, no per-tile
-- focus, and no React mount-order race. Arming a second scan session disarms
-- the first BY CONSTRUCTION — see ux_work_sessions_armed_scan below.
--
-- MODELLED ON counter_sessions (2026-08-20a), the only session table in this
-- repo correct in every dimension: organization_id with NO DDL default,
-- enforce_tenant_isolation() in the SAME migration, a `version` optimistic
-- counter, a claim lease, and a client_event_id idempotency anchor. Every one
-- of those is copied here deliberately.
--
-- DELIBERATELY *NOT* GROWN FROM station_scan_sessions OR picking_sessions.
-- Both lack organization_id ENTIRELY (see 0000_baseline: station_scan_sessions
-- is (staff_id, session_kind, shipment_id, …) with no tenant column at all).
-- This row becomes the parent of every tab, tool and ops_event in the shell;
-- birthing the root object of a multi-tenant app without a tenant column is
-- not a thing you fix later.
--
-- ── THE ONE-ARMED-SCAN RULE IS A DATABASE CONSTRAINT ────────────────────────
--
--   CREATE UNIQUE INDEX ux_work_sessions_armed_scan
--     ON work_sessions (organization_id)
--     WHERE kind = 'scan' AND armed = true;
--
-- A partial unique index over the TENANT COLUMN ALONE makes two armed scan
-- sessions structurally impossible in any tenant, from any code path, forever.
-- Application-level enforcement ("check, then write") loses to a concurrent
-- write every time — two tabs arming at once both read zero and both write one,
-- and now two surfaces own the wedge. The DB is the only place this invariant
-- can actually hold.
--
-- Consequence for writers: DISARM FIRST, THEN ARM, as two statements in one
-- transaction. A single multi-row UPDATE that swaps the flag can trip the
-- non-deferrable index mid-statement. armScanSession (src/lib/sessions/
-- work-sessions.ts) does exactly that, and the whole swap is atomic.
--
-- The companion CHECK (work_sessions_armed_chk) says armed implies a live scan
-- session, so an ended or parked row can never hold the arm and the partial
-- index can never be "used up" by a dead session.
--
-- scan_type IS AN IFF, NOT A HINT. work_sessions_scan_type_chk reads
-- `(kind = 'scan') = (scan_type IS NOT NULL)` — a task session carrying a
-- scanType is as much a corruption as a scan session missing one. Both halves
-- in one CHECK so neither can be satisfied alone.
--
-- device_id IS TEXT WITH NO FK, unlike counter_sessions.kiosk_device_id. That
-- column is a FK because it routes to an ENROLLED customer tablet. A work
-- session runs on a warehouse desktop or handheld that is not a kiosk_devices
-- principal; this is a browser/device fingerprint for "resume my shell here",
-- not a reference to a row.
--
-- surface_key IS TEXT WITH NO FK either — it names a SURFACE_REGISTRY entry
-- (src/lib/stations/surface-keys.ts), which is CODE, not a table. It is what
-- makes a task session identifiable at all: a scan session is discriminated by
-- scan_type, a task session by the surface whose job it is doing.
--
-- state JSONB is for true per-session variant scratch (draft buffers, tile
-- geometry). Queryable business facts stay real columns above
-- (polymorphic-tables.md).
--
-- SESSIONS ARE PERSISTENT (D8, ruled). There is no expires_at and no absolute
-- wall — station_scan_sessions' `NOW() + INTERVAL '12 hours'` default is
-- exactly what this table refuses to inherit. A mounted shell is not killed
-- mid-shift. claim_expires_at is a LEASE on who is editing, not a session TTL.
--
-- TENANCY: tenant-from-birth. organization_id UUID NOT NULL with no DEFAULT in
-- the raw DDL; enforce_tenant_isolation() installs the loud-fail GUC default,
-- FORCE RLS and the canonical policy. Safe immediately — zero existing writers;
-- every writer lands behind withTenantTransaction.
--
-- EXPAND-FIRST: this migration lands BEFORE any code reads it
-- (backend-patterns.md). Nothing here is destructive.
--
-- ROLLBACK:
--   select relax_tenant_isolation('work_sessions');
--   drop table if exists work_sessions;
--
-- VERIFY:
--   \d+ work_sessions
--   -- the invariant, proven:
--   insert into work_sessions (organization_id, kind, scan_type, armed, client_event_id)
--     values (:org, 'scan', 'unbox', true, gen_random_uuid());
--   insert into work_sessions (organization_id, kind, scan_type, armed, client_event_id)
--     values (:org, 'scan', 'test', true, gen_random_uuid());  -- must ERROR

BEGIN;

CREATE TABLE IF NOT EXISTS work_sessions (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,        -- NO default; enforce_tenant_isolation installs it

  -- The discriminator. 'scan' | 'task' — CHECK below.
  kind                TEXT NOT NULL,
  -- NOT NULL iff kind = 'scan'. Vocabulary: SCAN_SESSION_TYPES
  -- (src/lib/sessions/types.ts), mirrored by SURFACE_REGISTRY[key].session.
  scan_type           TEXT,
  -- The wedge owner. At most ONE true per org — ux_work_sessions_armed_scan.
  armed               BOOLEAN NOT NULL DEFAULT false,

  -- Which SURFACE_REGISTRY entry this session is doing the job of. Code
  -- registry key, not a FK.
  surface_key         TEXT,

  status              TEXT NOT NULL DEFAULT 'open',   -- CHECK below
  -- Monotonic; bumped by exactly one per accepted mutation. Same contract as
  -- counter_sessions.version — a client applies an event only at version + 1.
  version             INTEGER NOT NULL DEFAULT 0,

  -- Whose work this is (the operator), vs. who currently holds the edit lease.
  -- They differ when a lead resumes someone else's parked session.
  staff_id            INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  claimed_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  claim_expires_at    TIMESTAMPTZ,

  -- Free-form device/browser fingerprint — "resume my shell here". No FK.
  device_id           TEXT,

  -- Idempotency anchor, minted when the session opens so it outlives the tab.
  client_event_id     UUID NOT NULL,

  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at            TIMESTAMPTZ,

  state               JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT work_sessions_version_nonneg CHECK (version >= 0)
);

DO $$ BEGIN
  ALTER TABLE work_sessions ADD CONSTRAINT work_sessions_kind_chk
    CHECK (kind IN ('scan', 'task'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- IFF, both directions in one constraint: a scan session HAS a scan_type and a
-- task session does NOT.
DO $$ BEGIN
  ALTER TABLE work_sessions ADD CONSTRAINT work_sessions_scan_type_chk
    CHECK ((kind = 'scan') = (scan_type IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_sessions ADD CONSTRAINT work_sessions_status_chk
    CHECK (status IN ('open', 'parked', 'ended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only a LIVE scan session may hold the arm. Keeps a parked/ended row from
-- occupying the partial unique index slot forever.
DO $$ BEGIN
  ALTER TABLE work_sessions ADD CONSTRAINT work_sessions_armed_chk
    CHECK (armed = false OR (kind = 'scan' AND status = 'open'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- An ended session records when; a live one must not.
DO $$ BEGIN
  ALTER TABLE work_sessions ADD CONSTRAINT work_sessions_ended_at_chk
    CHECK ((status = 'ended') = (ended_at IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── THE INVARIANT ───────────────────────────────────────────────────────────
-- At most one armed scan session per tenant. Structural, not advisory.
CREATE UNIQUE INDEX IF NOT EXISTS ux_work_sessions_armed_scan
  ON work_sessions (organization_id)
  WHERE kind = 'scan' AND armed = true;

-- Idempotency anchor, org-led (never a global unique on a client uuid).
CREATE UNIQUE INDEX IF NOT EXISTS ux_work_sessions_client_event
  ON work_sessions (organization_id, client_event_id);

-- "My open sessions" and the resume list.
CREATE INDEX IF NOT EXISTS idx_work_sessions_org_status_started
  ON work_sessions (organization_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_sessions_org_staff_status
  ON work_sessions (organization_id, staff_id, status)
  WHERE staff_id IS NOT NULL;

-- ── Tenant-from-birth ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('work_sessions');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — work_sessions left without FORCE RLS';
  END IF;
END $$;

COMMIT;
