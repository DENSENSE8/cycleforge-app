-- 2026-08-23e_work_session_intervals.sql
--
-- work_session_intervals — the stretches a work session was actually being
-- worked, and the stretches it was set aside.
--
-- Plan: docs/warehouse-os/02-target-architecture.md §2 · 04-roadmap.md Phase 2.
-- Parent: work_sessions (2026-08-22b). Readers: src/lib/sessions/session-metrics.ts
-- (pure, DB-free) and src/lib/sessions/session-rollup.ts (tenant-scoped).
--
-- ── WHY A TABLE AND NOT TWO TIMESTAMP COLUMNS ───────────────────────────────
--
-- The tempting cheap version is `parked_at` + `total_parked_seconds` on
-- work_sessions. It is wrong in two independent ways, and both of them are
-- ordinary rather than exotic:
--
--   1. A session is parked and resumed MANY times. A receiver parks Unbox to
--      answer a phone, resumes, parks again for a pallet delivery, resumes.
--      Two columns hold the last park and a running sum; they cannot answer
--      "when was this session idle", which is the question a supervisor
--      actually asks when a carton took three hours.
--
--   2. A LEAD CAN RESUME SOMEONE ELSE'S PARKED SESSION. That is precisely why
--      work_sessions carries claimed_by_staff_id separately from staff_id. A
--      running sum on the parent row has nowhere to record that the first
--      forty minutes were Ana's and the next fifteen were Marco's, so every
--      resumed session would attribute its whole duration to one person. That
--      is not a rounding error — it is a report that credits the wrong human.
--
-- So: one row per stretch, each carrying its own staff_id. Duration is a fold
-- over rows, not a column that has to be kept true by every writer.
--
-- ── kind: 'active' | 'parked' ───────────────────────────────────────────────
--
-- The intervals TILE the session: at any instant between started_at and
-- ended_at the session is in exactly one of them. This is deliberately NOT
-- "only record the parked stretches and subtract" — an explicit active row is
-- what carries staff_id per stretch (see 2 above), and a tiling is checkable
-- (sum of interval lengths == wall clock) in a way that a sparse list of holes
-- is not.
--
-- 'parked' is NOT the same fact as work_sessions.status = 'parked'. The status
-- is the session's CURRENT state; these rows are its HISTORY. A session that
-- is open right now still has parked intervals from an hour ago.
--
-- ── AT MOST ONE OPEN INTERVAL PER SESSION IS A DATABASE GUARANTEE ───────────
--
--   CREATE UNIQUE INDEX ux_work_session_intervals_open
--     ON work_session_intervals (session_id) WHERE ended_at IS NULL;
--
-- Same stance as ux_work_sessions_armed_scan on the parent: a partial unique
-- index, not an application check. Two devices racing to park the same session
-- both read "one open active interval" and both write a parked one; the index
-- makes the loser fail at the database instead of silently double-counting the
-- park. Writers must CLOSE the open interval and OPEN the next one as two
-- ordered statements inside one transaction — close first, exactly as
-- armScanSession disarms before it arms, because the index is not deferrable.
--
-- Deliberately NOT an EXCLUDE constraint over a tstzrange. A GiST exclusion
-- would also forbid overlapping CLOSED intervals, which sounds stricter and is
-- actually worse here: it needs btree_gist, it cannot express "at most one
-- OPEN" without still adding this index, and a clock-skewed close that
-- overlaps its successor by a millisecond would reject an operator's park
-- rather than record it slightly wrong. The floor must not stop for a
-- millisecond of skew (see the CHECK below, which allows equality for the same
-- reason).
--
-- ── ON DELETE CASCADE, UNLIKE THE EVENT SPINES ──────────────────────────────
--
-- ops_events.session_id and inventory_events.session_id are ON DELETE SET NULL
-- because those rows are facts about a UNIT that outlive their container. An
-- interval is not a fact about anything except the session — "this session was
-- parked from 10:04 to 10:19" is meaningless once the session is gone, and an
-- orphan would silently drop out of every duration fold. CASCADE.
--
-- ── started_at / ended_at COME FROM THE DB CLOCK ────────────────────────────
--
-- Every writer passes now(), never a client timestamp. Durations computed off
-- these rows would otherwise mix two clocks: a handheld five minutes fast would
-- report negative parked time, or a session that ended before it started.
-- Contrast the event spines, where occurred_at is deliberately client-minted at
-- scan time so an async burst reports in SCAN order rather than arrival order
-- (src/lib/sessions/scan-write-order.ts). Two different jobs, two different
-- clocks, and they must not be crossed — session-metrics.ts states this in its
-- docblock and never reads an event's occurred_at into a duration.
--
-- ── TENANCY: tenant-from-birth ──────────────────────────────────────────────
--
-- organization_id UUID NOT NULL with NO DDL default; enforce_tenant_isolation()
-- in this same migration installs the loud-fail GUC default, FORCE RLS and the
-- canonical policy. Safe immediately — zero existing writers, and every writer
-- lands behind withTenantTransaction on the parent's transaction.
--
-- Carrying organization_id here rather than relying on the join to
-- work_sessions is not redundancy: RLS is per-table, and a child table without
-- its own tenant column is readable by any tenant that can guess a session_id.
--
-- EXPAND-FIRST: this migration lands BEFORE any code reads or writes it. New
-- table, nothing destructive.
--
-- ROLLBACK:
--   select relax_tenant_isolation('work_session_intervals');
--   drop table if exists work_session_intervals;
--
-- VERIFY:
--   \d+ work_session_intervals
--   -- the invariant, proven:
--   insert into work_session_intervals (organization_id, session_id, kind, started_at)
--     values (:org, :sid, 'active', now());
--   insert into work_session_intervals (organization_id, session_id, kind, started_at)
--     values (:org, :sid, 'parked', now());   -- must ERROR

BEGIN;

CREATE TABLE IF NOT EXISTS work_session_intervals (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,        -- NO default; enforce_tenant_isolation installs it

  session_id       BIGINT NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,

  -- 'active' | 'parked' — CHECK below. The two tile the session's wall clock.
  kind             TEXT NOT NULL,

  started_at       TIMESTAMPTZ NOT NULL,
  -- NULL = the session is in this interval right now. At most one per session
  -- (ux_work_session_intervals_open).
  ended_at         TIMESTAMPTZ,

  -- WHO worked this stretch. Denormalized from the parent on purpose: a lead
  -- resuming someone else's parked session makes the next stretch theirs, and
  -- work_sessions.staff_id cannot hold two answers.
  staff_id         INTEGER REFERENCES staff(id) ON DELETE SET NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE work_session_intervals ADD CONSTRAINT work_session_intervals_kind_chk
    CHECK (kind IN ('active', 'parked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- `>=`, not `>`. A park and an immediate resume inside the same millisecond is
-- a legitimate operator action (a mis-tap corrected at once), and a zero-length
-- interval folds to zero harmlessly. Rejecting it would fail the write and stop
-- the floor to defend an arithmetic nicety.
DO $$ BEGIN
  ALTER TABLE work_session_intervals ADD CONSTRAINT work_session_intervals_order_chk
    CHECK (ended_at IS NULL OR ended_at >= started_at);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── THE INVARIANT ───────────────────────────────────────────────────────────
-- At most one OPEN interval per session. Structural, not advisory.
CREATE UNIQUE INDEX IF NOT EXISTS ux_work_session_intervals_open
  ON work_session_intervals (session_id)
  WHERE ended_at IS NULL;

-- The duration fold: every interval of one session, in order.
CREATE INDEX IF NOT EXISTS idx_work_session_intervals_session
  ON work_session_intervals (organization_id, session_id, started_at);

-- "What did this person actually work today" — the per-staff rollup, which
-- reads intervals rather than sessions precisely because a resumed session
-- belongs to more than one staffer.
CREATE INDEX IF NOT EXISTS idx_work_session_intervals_staff_time
  ON work_session_intervals (organization_id, staff_id, started_at DESC)
  WHERE staff_id IS NOT NULL;

-- ── Tenant-from-birth ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('work_session_intervals');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — work_session_intervals left without FORCE RLS';
  END IF;
END $$;

COMMENT ON TABLE work_session_intervals IS
  'One row per stretch a work session was active or parked. Durations are a fold over these rows, never a column on work_sessions — a session parks many times and a lead may resume someone else''s, so each stretch carries its own staff_id.';

COMMENT ON COLUMN work_session_intervals.kind IS
  '''active'' | ''parked''. HISTORY, not state: work_sessions.status is what the session is now, these rows are where it has been. The two kinds tile the session''s wall clock.';

COMMENT ON COLUMN work_session_intervals.staff_id IS
  'Who worked THIS stretch — work_sessions.staff_id is who the session belongs to, claimed_by_staff_id is who holds the edit lease now. A session resumed by a lead attributes each stretch to whoever actually worked it.';

COMMIT;
