-- 2026-09-29_work_assignment_follow_ups.sql
--
-- The follow-up log for a thrown task: an append-only activity row per chase
-- (email / call / ticket reply / note), the CRM "engagement" shape. A
-- follow-up is an EVENT with a time and words, not a record reference, so it
-- is not a `work_assignment_links` kind.
--
-- The latest instant is denormalised onto `work_assignments` for sorting:
--   last_follow_up_at  — GREATEST(existing, occurred_at), set by the writer in
--                        the same transaction as the insert
--   next_follow_up_at  — operator-set "chase again at"
--
-- `provider`, `provider_thread_id`, `provider_message_id` stay NULL in phase 1
-- (free text); phase 2 Gmail send fills them without a schema change.
--
-- SAFETY: new table, tenant-from-birth. The only writer
-- (src/lib/tasks/task-follow-ups-db.ts via /api/tasks/[id]/follow-ups) runs
-- inside withTenantTransaction and stamps organization_id from the auth
-- context, so the loud-fail org default and FORCE RLS are safe from day one.
-- The two new work_assignments columns are nullable with no default: a
-- metadata-only ALTER, no rewrite, no backfill.
--
-- ROLLBACK:
--   SELECT relax_tenant_isolation('work_assignment_follow_ups');
--   DROP TABLE IF EXISTS work_assignment_follow_ups;
--   ALTER TABLE work_assignments
--     DROP COLUMN IF EXISTS last_follow_up_at,
--     DROP COLUMN IF EXISTS next_follow_up_at;
--
-- VERIFY:
--   \d+ work_assignment_follow_ups
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'work_assignments'
--      AND column_name IN ('last_follow_up_at', 'next_follow_up_at');
--   npm run tenancy:coverage

BEGIN;

CREATE TABLE IF NOT EXISTS work_assignment_follow_ups (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  assignment_id       INTEGER NOT NULL REFERENCES work_assignments(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL,
  direction           TEXT NOT NULL DEFAULT 'outbound',
  occurred_at         TIMESTAMPTZ NOT NULL,
  staff_id            INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  email_to            TEXT,
  email_subject       TEXT,
  body                TEXT,
  provider            TEXT,
  provider_thread_id  TEXT,
  provider_message_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE work_assignment_follow_ups
    ADD CONSTRAINT work_assignment_follow_ups_channel_chk
    CHECK (channel IN ('email', 'call', 'ticket', 'note'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE work_assignment_follow_ups
    ADD CONSTRAINT work_assignment_follow_ups_direction_chk
    CHECK (direction IN ('outbound', 'inbound'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_work_assignment_follow_ups_assignment
  ON work_assignment_follow_ups (organization_id, assignment_id, occurred_at DESC);

ALTER TABLE work_assignments
  ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('work_assignment_follow_ups');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — work_assignment_follow_ups left without FORCE RLS';
  END IF;
END $$;

COMMIT;
