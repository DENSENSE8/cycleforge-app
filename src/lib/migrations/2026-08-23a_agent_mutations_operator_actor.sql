-- 2026-08-23a_agent_mutations_operator_actor.sql
--
-- agent_mutations grows an ACTOR MODEL, a session anchor, and an explicit
-- reversibility classification — so an operator's action is a first-class row
-- in the ledger instead of an agent impersonation.
--
-- Plan: docs/warehouse-os/02-target-architecture.md §4 · 04-roadmap.md Phase 8.
--
-- ── WHY THE TABLE IS ALREADY THE RIGHT TABLE ────────────────────────────────
--
-- `agent_mutations` (2026-07-03o) is the ONLY invertible write path in this
-- repo. Every row carries the payload that was applied AND, in
-- `extra_audit.inverse`, a captured descriptor that `revertAgentMutation` can
-- replay to undo it. Nothing else in the schema has that: `inventory_events`
-- is append-only with no `reverses_event_id`, and `audit_logs` is written by a
-- fire-and-forget helper that swallows its own errors — neither is a replay
-- log, and building a second undo stack beside this one would give the Process
-- tool two ledgers that disagree.
--
-- So the move is to widen the actor, not to fork the table. The name stays
-- `agent_mutations` because renaming a table with a live writer, three indexes,
-- an FK child (`agent_mutation_affects`) and a trust-stats reader buys nothing
-- an `actor_kind` column does not.
--
-- ── actor_kind ──────────────────────────────────────────────────────────────
--
-- DEFAULT 'agent' is correct and is not laziness: every row that exists at the
-- time this lands WAS written by `applyAgentMutation` on behalf of the
-- assistant. Backfilling them to anything else would be a lie.
--
-- The distinction is load-bearing rather than decorative — it is what the trust
-- model reads:
--   • 'agent'    — the assistant proposed it. Trust class decides whether it
--                  applied or queued for review (registry.ts MUTATION_KINDS).
--   • 'operator' — a human did it with their own hands, through a surface they
--                  already hold the permission for. There is no review queue
--                  for a thing a person is allowed to do; the row exists so it
--                  can be SHOWN and UNDONE, not so it can be approved.
--   • 'system'   — a job / migration / replay. Reserved; nothing writes it yet.
-- Mixing operator rows into the 'agent' bucket would silently corrupt
-- `getMutationTrustStats` (trust-stats.ts), whose acceptance rate is the input
-- to widening a kind's trust class: a human undoing their own park would read
-- as the AI getting something wrong.
--
-- ── work_session_id ─────────────────────────────────────────────────────────
--
-- The Process tool's whole question is "what did THIS session do", and
-- `ai_chat_session_id` cannot answer it — that column points at
-- `ai_chat_sessions`, a chat transcript, and an operator parking a carton has
-- no chat. A real FK to `work_sessions` (2026-08-22b) with ON DELETE SET NULL:
-- the ledger must outlive the session the way mutations already outlive chat
-- sessions, because the ledger IS the record of what happened.
--
-- The FK is on `id` alone, not (organization_id, id). That matches the
-- convention already in the schema (inventory_events.receiving_line_id, this
-- table's own proposed_by_staff_id) and is safe here for a specific reason:
-- referential-integrity checks run as the table owner and are not subject to
-- RLS, but every WRITER goes through withTenantTransaction with an explicit
-- `organization_id = $1` predicate, so a cross-tenant session id is never
-- reachable by the code that fills this column.
--
-- ── reversibility ───────────────────────────────────────────────────────────
--
-- A real column, not a JSONB field, because it answers a query the tool runs on
-- every open: "which of this session's actions can still be undone." Three
-- values, and the third is the honest one:
--   • 'revertable'   — an inverse descriptor was captured; revert can replay it.
--   • 'irreversible' — NO inverse exists, by construction, and we say so. A
--                      serial-unit transition writes an append-only
--                      inventory_events row with no reversal link; ending a
--                      session is refused by resumeSession with
--                      SESSION_ALREADY_ENDED. The Process tool renders these as
--                      locked with the reason, which is the point: a tool that
--                      ADMITS it cannot undo something is correct, while one
--                      that silently no-ops is a data-loss bug.
--   • 'unknown'      — the pre-existing rows. They may or may not carry an
--                      inverse in extra_audit; the classifier did not exist
--                      when they were written, so claiming either would be
--                      fabrication. revertAgentMutation already resolves this
--                      at read time by looking for extra_audit.inverse, and it
--                      keeps doing exactly that for 'unknown' rows.
-- The human-readable REASON lives in extra_audit.irreversibleReason — it is
-- display text, not a fact anything filters on.
--
-- ── ORDERING NOTE (why this file is 'a' and not a second 'b') ───────────────
--
-- Two files sharing one date-letter slot are ordered by DESCRIPTION, and that
-- has already inverted an expand/contract pair once in this repo's history. The
-- three files landing today each take their own letter, so the order is the
-- letter and nothing else: a (this) → b (ops_events session columns) →
-- c (audit_logs tenancy). This one is first because the Process tool cannot
-- read a session's ledger without it.
--
-- EXPAND-FIRST: three nullable/defaulted ADD COLUMNs and two indexes. No
-- existing writer changes meaning; applyAgentMutation keeps working unmodified
-- against a DB where this has not run (it names its columns explicitly).
-- Nothing here is destructive.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_agent_mutations_org_work_session;
--   DROP INDEX IF EXISTS idx_agent_mutations_org_actor_kind_time;
--   ALTER TABLE agent_mutations
--     DROP COLUMN IF EXISTS reversibility,
--     DROP COLUMN IF EXISTS work_session_id,
--     DROP COLUMN IF EXISTS actor_kind;
--
-- VERIFY:
--   \d+ agent_mutations
--   select actor_kind, reversibility, count(*) from agent_mutations
--    group by 1,2 order by 1,2;   -- expect only ('agent','unknown') before any new write

BEGIN;

ALTER TABLE agent_mutations
  ADD COLUMN IF NOT EXISTS actor_kind      TEXT NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS work_session_id BIGINT,
  ADD COLUMN IF NOT EXISTS reversibility   TEXT NOT NULL DEFAULT 'unknown';

DO $$ BEGIN
  ALTER TABLE agent_mutations ADD CONSTRAINT agent_mutations_actor_kind_chk
    CHECK (actor_kind IN ('agent', 'operator', 'system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE agent_mutations ADD CONSTRAINT agent_mutations_reversibility_chk
    CHECK (reversibility IN ('revertable', 'irreversible', 'unknown'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Guarded: work_sessions is created by 2026-08-22b. If an environment somehow
-- runs this first the column still lands; only the FK waits.
DO $$
BEGIN
  IF to_regclass('public.work_sessions') IS NULL THEN
    RAISE NOTICE 'agent_mutations.work_session_id: work_sessions absent — FK skipped';
  ELSE
    BEGIN
      ALTER TABLE agent_mutations
        ADD CONSTRAINT agent_mutations_work_session_fk
        FOREIGN KEY (work_session_id) REFERENCES work_sessions(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- THE PROCESS TOOL'S READ, exactly: this org, this session, newest first.
CREATE INDEX IF NOT EXISTS idx_agent_mutations_org_work_session
  ON agent_mutations (organization_id, work_session_id, created_at DESC, id DESC)
  WHERE work_session_id IS NOT NULL;

-- Trust-stats has to be able to EXCLUDE operator rows cheaply, or the
-- acceptance rate it reports is not about the AI at all.
CREATE INDEX IF NOT EXISTS idx_agent_mutations_org_actor_kind_time
  ON agent_mutations (organization_id, actor_kind, created_at DESC, id DESC);

COMMENT ON COLUMN agent_mutations.actor_kind IS
  'Who did this: agent (assistant proposal, trust-classed) | operator (a human, through a surface they already hold the permission for) | system (reserved). Trust stats must filter to agent rows or a human undo reads as an AI failure.';

COMMENT ON COLUMN agent_mutations.work_session_id IS
  'work_sessions.id this action belongs to. The Process tool reads one session''s ledger through this; ai_chat_session_id cannot answer it (an operator has no chat transcript). SET NULL on delete — the ledger outlives the session.';

COMMENT ON COLUMN agent_mutations.reversibility IS
  'revertable (an inverse descriptor was captured) | irreversible (no inverse EXISTS — append-only inventory_events, an ended session) | unknown (written before this classifier; revertAgentMutation resolves it from extra_audit.inverse at read time). Reason text lives in extra_audit.irreversibleReason.';

COMMIT;
