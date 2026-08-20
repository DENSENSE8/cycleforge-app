-- 2026-08-19b_daily_checks.sql
--
-- The daily checklist: a fixed list of things each staffer confirms every day,
-- and the per-person, per-day record of what they confirmed.
--
-- TWO TABLES, because they answer two different questions:
--   daily_check_items — WHAT is on the list (org-managed, changes rarely)
--   daily_check_marks — WHO confirmed WHICH item on WHICH day (append-mostly)
--
-- PER PERSON, not per item. A mark is keyed (item, staff, day), so every
-- staffer gets their own copy of the same list and the day's report can say
-- "Sam did 5 of 6" rather than only "5 of 6 got done by somebody". That is the
-- whole reason the report exists, so the grain is set here rather than being a
-- later migration.
--
-- THIS IS NOT THE DELETED `checklist_templates`. That table was dropped on
-- 2026-08-01 because Unbox procedure steps must be derived from photo evidence
-- — a box got ticked when someone remembered to tick it, rather than because
-- the photo existed. That reasoning does not reach here and must not be cited
-- against this table: a daily ops check ("front door locked", "printer has
-- labels") has no evidence to derive from. Human attestation IS the fact being
-- recorded, and the mark carries who and when so the attestation is attributed.
--
-- WHY `effective_from` / `retired_at` INSTEAD OF `active BOOLEAN`:
-- a report for a PAST day must show the list as it stood ON that day. With a
-- boolean, adding an item today makes yesterday's report retroactively show a
-- missed item that did not exist, and retiring one erases it from every report
-- it ever appeared in. Two civil-date columns cost one extra column and make
-- every historical report honest. An item is in effect on day D when
--   effective_from <= D AND (retired_at IS NULL OR retired_at > D).
--
-- CIVIL DAY, NOT AN INSTANT. `marked_on` is DATE and carries the warehouse
-- civil day (America/Los_Angeles) resolved by the caller via
-- getCurrentPSTDateKey() — never the server's local date. `marked_at` keeps
-- the instant for the report's timestamps. Both, because they are different
-- types (.claude/rules/source-of-truth.md → Dates & times).
--
-- IDEMPOTENT MARKS. UNIQUE (organization_id, item_id, staff_id, marked_on) so
-- a double-tap on a phone, or a retried request, is a no-op rather than a
-- second row that would double-count the report.
--
-- TENANCY: tenant-from-birth. organization_id UUID NOT NULL with no DEFAULT in
-- the raw DDL; enforce_tenant_isolation() installs the loud-fail GUC default,
-- FORCE RLS and the canonical policy. Safe immediately — both tables have zero
-- existing writers, and every writer lands in this same PR behind
-- withTenantTransaction(orgId, …).
--
-- ROLLBACK:
--   select relax_tenant_isolation('daily_check_marks');
--   select relax_tenant_isolation('daily_check_items');
--   drop table if exists daily_check_marks;
--   drop table if exists daily_check_items;
--
-- VERIFY:
--   \d+ daily_check_items
--   \d+ daily_check_marks
--   npm run tenancy:coverage

BEGIN;

-- ─── The list ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_check_items (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,          -- NO default; enforce_tenant_isolation() installs it
  title           TEXT NOT NULL,
  -- Array position is the operator-facing order. A new item appends; reordering
  -- rewrites this column and nothing else.
  sort_order      INTEGER NOT NULL DEFAULT 0,
  -- Civil days (see header). effective_from defaults to the warehouse day the
  -- row is written; the writer passes it explicitly.
  effective_from  DATE NOT NULL,
  retired_at      DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_check_items_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  -- A window that closes before it opens would silently drop the item from
  -- every report rather than failing loudly.
  CONSTRAINT daily_check_items_window_chk CHECK (retired_at IS NULL OR retired_at > effective_from)
);

COMMENT ON TABLE daily_check_items IS
  'The fixed daily checklist. One row per thing every staffer confirms each day. Soft-retired via retired_at so past reports keep the list as it stood that day.';

-- The list read is always "the items in effect on day D, in order" — org-led
-- so it never degrades to a cross-tenant scan.
CREATE INDEX IF NOT EXISTS idx_daily_check_items_window
  ON daily_check_items (organization_id, effective_from, sort_order);

-- ─── The marks ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_check_marks (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,          -- NO default; enforce_tenant_isolation() installs it
  item_id         BIGINT NOT NULL REFERENCES daily_check_items(id) ON DELETE CASCADE,
  staff_id        INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  -- Warehouse civil day, resolved by the caller. Never now()::date — the server
  -- clock is UTC and would roll the day over mid-afternoon on the floor.
  marked_on       DATE NOT NULL,
  marked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  note            TEXT,
  CONSTRAINT daily_check_marks_note_len CHECK (note IS NULL OR char_length(note) <= 500)
);

COMMENT ON TABLE daily_check_marks IS
  'One row = this staffer confirmed this item on this warehouse day. Unique per (org,item,staff,day) so a retry is a no-op.';

-- Idempotency (see header): the mark write is an ON CONFLICT DO NOTHING upsert
-- against this key.
CREATE UNIQUE INDEX IF NOT EXISTS ux_daily_check_marks_day
  ON daily_check_marks (organization_id, item_id, staff_id, marked_on);

-- The report read: every mark for one day, joined to staff.
CREATE INDEX IF NOT EXISTS idx_daily_check_marks_day
  ON daily_check_marks (organization_id, marked_on);

-- ─── Tenant-from-birth ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('daily_check_items');
    PERFORM enforce_tenant_isolation('daily_check_marks');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — daily_check_* left without FORCE RLS';
  END IF;
END $$;

COMMIT;
