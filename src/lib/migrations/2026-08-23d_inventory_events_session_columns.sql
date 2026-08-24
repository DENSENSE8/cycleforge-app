-- 2026-08-23d_inventory_events_session_columns.sql
--
-- inventory_events gains a nullable `session_id` + `session_type`.
--
-- Plan: docs/warehouse-os/02-target-architecture.md §5 · 04-roadmap.md Phase 2.
-- Sibling: 2026-08-23b_ops_events_session_columns.sql (same two columns, on the
-- other spine). Read that file first — its rationale for WHY session_type is
-- denormalized and WHY there is no CHECK applies here unchanged and is not
-- repeated.
--
-- ── WHY BOTH SPINES, WHEN 08-23b ARGUED FOR ops_events ALONE ────────────────
--
-- 08-23b picked ops_events because it is the only spine already shaped
-- polymorphically, and because collapsing journey.ts's thirteen-way UNION into
-- one indexed read is the end state. That is still the end state. But it is a
-- destination, not today's data.
--
-- Unit lifecycle does not live in ops_events. It lives HERE: RECEIVED,
-- TEST_START/PASS/FAIL, PUTAWAY, MOVED, PICKED, PACKED, SHIPPED — the entire
-- answer to "what was actually added, tested and moved during this session" is
-- inventory_events rows, written by 35 call sites through recordInventoryEvent
-- (src/lib/inventory/events.ts) and by the guarded state machine
-- (src/lib/inventory/state-machine.ts → transition()).
--
-- Attributing only ops_events would produce a session-contents read that can
-- report signals and scans but not a single unit — which is the one question
-- the operator asked. Waiting for the spine merge before answering it would
-- make the merge a prerequisite of the feature rather than a later cleanup.
-- So: thread BOTH now, merge later. When inventory_events is eventually folded
-- into ops_events these two columns come along already populated, which makes
-- that migration a copy rather than a backfill-by-inference.
--
-- ── THE SHAPE DIFFERENCE IS DELIBERATE, AND NOT UNIFIED HERE ────────────────
--
--   ops_events        → polymorphic:   (entity_type, entity_id BIGINT)
--   inventory_events  → explicit FKs:  receiving_id, receiving_line_id,
--                                      serial_unit_id, sku, bin_id, …
--
-- No attempt is made in this migration to reconcile them. A session_id column
-- means the same thing on both — "the work_sessions row this fact happened
-- inside" — and that is the only thing this change asserts. Rewriting
-- inventory_events' subject columns is a separate, much larger act with its own
-- expand/contract, and bundling it here would make a two-column additive change
-- unshippable.
--
-- ── session_id ──────────────────────────────────────────────────────────────
--
-- BIGINT, nullable, FK to work_sessions(id) ON DELETE SET NULL — identical
-- contract to ops_events.session_id. The event is an immutable fact about the
-- unit; the session is the container it happened in. Removing the container
-- does not un-happen the fact, so the link clears and the row stays.
--
-- On `id` alone rather than (organization_id, id): FK checks are not
-- RLS-subject, and the only writers run under withTenantTransaction /
-- tenantQuery with an explicit org predicate, so a cross-tenant session id is
-- not reachable from the code that fills the column. Same call as 08-23a/08-23b.
--
-- ── TENANCY: inventory_events DOES carry organization_id ────────────────────
--
-- Added by 2026-05-23_org_id_on_business_tables.sql and covered by
-- 2026-06-22e_enforce_tenant_isolation_core_usav_fallback.sql (the table is in
-- that migration's list), so it has FORCE RLS and the canonical policy already.
-- The index below is therefore org-led like every other read path on this
-- table — no tenancy gap to note, and no workaround inherited.
--
-- ── EXPAND → CODE → CONTRACT ────────────────────────────────────────────────
--
-- This is the EXPAND step and it lands BEFORE any reader or writer. Two
-- nullable ADD COLUMNs; every existing INSERT names its columns explicitly
-- (see recordInventoryEvent's two SQL literals) and is unaffected. The change
-- that follows adds a REQUIRED `session` field to RecordInventoryEventInput so
-- the compiler enumerates all 35 call sites rather than letting a default
-- silently opt them out.
--
-- Backfill is NOT attempted and must not be. work_sessions did not exist until
-- 2026-08-22b, so no historical inventory_event happened inside one and every
-- pre-existing row is honestly NULL. Inferring a session from timestamps and
-- staff ids would manufacture history — and this table's history is what
-- warranty and payroll disputes are settled with.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_ie_org_session_time;
--   DROP INDEX IF EXISTS idx_ie_org_session_type_time;
--   ALTER TABLE inventory_events
--     DROP CONSTRAINT IF EXISTS inventory_events_session_fk,
--     DROP COLUMN IF EXISTS session_type,
--     DROP COLUMN IF EXISTS session_id;
--
-- VERIFY:
--   \d+ inventory_events
--   select session_type, count(*) from inventory_events group by 1;  -- all NULL until writers thread it

BEGIN;

ALTER TABLE inventory_events
  ADD COLUMN IF NOT EXISTS session_id   BIGINT,
  ADD COLUMN IF NOT EXISTS session_type TEXT;

DO $$
BEGIN
  IF to_regclass('public.work_sessions') IS NULL THEN
    RAISE NOTICE 'inventory_events.session_id: work_sessions absent — FK skipped';
  ELSE
    BEGIN
      ALTER TABLE inventory_events
        ADD CONSTRAINT inventory_events_session_fk
        FOREIGN KEY (session_id) REFERENCES work_sessions(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- "Everything this session touched", newest first — sessionContents()'s spine
-- read (src/lib/sessions/session-rollup.ts). Org-led because every read on this
-- table is, and partial because the vast majority of rows predate sessions and
-- would otherwise bloat the index for a predicate that never selects them.
CREATE INDEX IF NOT EXISTS idx_ie_org_session_time
  ON inventory_events (organization_id, session_id, occurred_at DESC, id DESC)
  WHERE session_id IS NOT NULL;

-- "Everything Unbox did this week" — the manager rollup, matching
-- idx_ops_events_org_session_type_time on the other spine so the two halves of
-- a session-type report have the same access shape.
CREATE INDEX IF NOT EXISTS idx_ie_org_session_type_time
  ON inventory_events (organization_id, session_type, occurred_at DESC, id DESC)
  WHERE session_type IS NOT NULL;

COMMENT ON COLUMN inventory_events.session_id IS
  'work_sessions.id this event happened inside, or NULL for events with no session (everything before 2026-08-22b, and every writer that passes NO_SESSION). SET NULL on delete — the event outlives its container.';

COMMENT ON COLUMN inventory_events.session_type IS
  'Denormalized session discriminator: work_sessions.scan_type for a scan session, the literal ''task'' for a task session. Repeated here on purpose — reporting groups by it, and it must stay correct after session_id is cleared. App-validated (SESSION_EVENT_TYPES, src/lib/sessions/attribution.ts); no CHECK, because the surface registry widens it. Same contract as ops_events.session_type (2026-08-23b).';

COMMIT;
