-- 2026-08-23b_ops_events_session_columns.sql
--
-- ops_events gains a nullable `session_id` + `session_type`.
--
-- Plan: docs/warehouse-os/02-target-architecture.md §5 · 04-roadmap.md
--       Phase 2 item 2 / Phase 8.
--
-- ── WHY ops_events AND NOT ONE OF THE OTHER TWELVE ─────────────────────────
--
-- Manager reporting today is `journey.ts`, and journey is a UNION over separate
-- spines: station_activity_logs, inventory_events, audit_logs,
-- shipment_tracking_events, warranty_claim_events, thread_messages,
-- ticket_links, ops_events. Every one of those has its own subject columns, its
-- own actor column, its own time column and its own idea of what an event is.
-- Reporting is "done" when it reads ops_events alone, and the union branch
-- count is the progress bar.
--
-- `ops_events` is the target because it is the ONLY one of them already shaped
-- polymorphically — (entity_type, entity_id) plus a jsonb payload, with a
-- deploy-time entity_type vocabulary pinned to code (OPS_EVENT_ENTITY_TYPES,
-- src/lib/ops-event-types.ts, drift-guarded by ops-events.test.ts). Every other
-- spine would need a subject rewrite before it could hold a foreign domain's
-- events. This one only needs to know which session an event happened inside.
--
-- ── session_id ──────────────────────────────────────────────────────────────
--
-- FK to work_sessions(id) ON DELETE SET NULL. An ops_event is an immutable fact
-- about the operation; the session is the container it happened in. If the
-- container is ever removed the fact does not stop being true, so the link
-- clears and the row stays — the same contract agent_mutations.ai_chat_session_id
-- has held since 2026-07-03o.
--
-- On `id` alone rather than (organization_id, id), for the reason set out in
-- 2026-08-23a: FK checks are not RLS-subject, but the only writer runs under
-- withTenantTransaction with an explicit org predicate, so a cross-tenant
-- session id is not reachable from the code that fills the column.
--
-- ── session_type IS DENORMALIZED ON PURPOSE ─────────────────────────────────
--
-- It repeats what a join to work_sessions could compute. That is the point,
-- twice over:
--
--   1. Reporting groups by it. The whole reason to collapse thirteen spines
--      into one is that a manager query stops being a thirteen-way UNION; a
--      per-row lookup into work_sessions would put a join right back into the
--      hot path of every grouped read.
--   2. It must survive its session. ON DELETE SET NULL clears session_id, and
--      an event whose only answer to "what kind of work was this" was a join
--      would go from 'unbox' to unknown the moment a session row was cleaned
--      up. The classification of a past event is not allowed to change.
--
-- VALUE VOCABULARY: the session's DISCRIMINATOR as an operator would name it —
-- `work_sessions.scan_type` for a scan session ('unbox' | 'triage' | 'pickup' |
-- 'test' | 'pack' | 'outbound', SCAN_SESSION_TYPES in src/lib/sessions/types.ts),
-- and the literal 'task' for a task session. Not `work_sessions.kind`: kind is
-- already implied ('task' or one of the scan types), and "how many events came
-- out of Unbox this week" is the question that actually gets asked.
--
-- NO CHECK CONSTRAINT, deliberately, and this is the one place this file
-- departs from the house preference for named CHECKs on small vocabularies.
-- SCAN_SESSION_TYPES is bound one-to-one to SURFACE_REGISTRY, and roadmap
-- phases 4-6 add surfaces. A CHECK here would mean a migration every time a
-- bench is added, and the plan's own rule (§3) is that a widened CHECK must be
-- redefined as a FULL UNION rather than appended — which is a lot of ceremony
-- to protect a reporting label. Validated app-side instead, exactly like this
-- table's neighbour `agent_mutations.mutation_kind` (2026-07-03o: "deliberately
-- NOT a CHECK — the trust list widens as data accumulates, kinds are additive").
--
-- ── EXPAND → CODE → CONTRACT ────────────────────────────────────────────────
--
-- This is the EXPAND step and it lands ahead of every reader and writer. Two
-- nullable ADD COLUMNs: existing INSERTs name their columns explicitly and are
-- unaffected, and `recordOpsEvent` (src/lib/ops-events.ts) does not yet thread
-- a session — it will, in the change that follows this one. A nullable
-- ADD COLUMN is always safe to ship early; the reverse never is.
--
-- Backfill is NOT attempted and must not be. No historical ops_event happened
-- inside a work_session — the table did not exist until 2026-08-22b — so every
-- pre-existing row is honestly NULL. Inferring a session from timestamps and
-- staff ids would manufacture history.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_ops_events_org_session_time;
--   DROP INDEX IF EXISTS idx_ops_events_org_session_type_time;
--   ALTER TABLE ops_events
--     DROP COLUMN IF EXISTS session_type,
--     DROP COLUMN IF EXISTS session_id;
--
-- VERIFY:
--   \d+ ops_events
--   select session_type, count(*) from ops_events group by 1;  -- all NULL until writers thread it

BEGIN;

ALTER TABLE ops_events
  ADD COLUMN IF NOT EXISTS session_id   BIGINT,
  ADD COLUMN IF NOT EXISTS session_type TEXT;

DO $$
BEGIN
  IF to_regclass('public.work_sessions') IS NULL THEN
    RAISE NOTICE 'ops_events.session_id: work_sessions absent — FK skipped';
  ELSE
    BEGIN
      ALTER TABLE ops_events
        ADD CONSTRAINT ops_events_session_fk
        FOREIGN KEY (session_id) REFERENCES work_sessions(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- "Everything that happened inside this session", newest first — the session
-- timeline and the Process tool's cross-check against the mutation ledger.
CREATE INDEX IF NOT EXISTS idx_ops_events_org_session_time
  ON ops_events (organization_id, session_id, occurred_at DESC, id DESC)
  WHERE session_id IS NOT NULL;

-- "Everything Unbox did this week" — the manager rollup this column exists for.
CREATE INDEX IF NOT EXISTS idx_ops_events_org_session_type_time
  ON ops_events (organization_id, session_type, occurred_at DESC, id DESC)
  WHERE session_type IS NOT NULL;

COMMENT ON COLUMN ops_events.session_id IS
  'work_sessions.id this event happened inside, or NULL for events with no session (everything before 2026-08-22b, and every writer not yet threaded). SET NULL on delete — the event outlives its container.';

COMMENT ON COLUMN ops_events.session_type IS
  'Denormalized session discriminator: work_sessions.scan_type for a scan session, the literal ''task'' for a task session. Repeated here on purpose — reporting groups by it, and it must stay correct after session_id is cleared. App-validated (SCAN_SESSION_TYPES, src/lib/sessions/types.ts); no CHECK, because the surface registry widens it.';

COMMIT;
