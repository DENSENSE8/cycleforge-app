-- 2026-09-10_counter_sessions_consult_stance.sql
--
-- Work · Show · Verify on the shared desk↔iPad visit.
--
-- `counter_sessions.face` is still staff | customer (projection). Show and
-- Verify are both customer-facing, so they cannot share that CHECK. This
-- column is the extra bit both devices read so a stance change converges
-- without a second cart.
--
-- SAFETY: additive NOT NULL DEFAULT 'work' — existing open visits stay in
-- Work (today's staff face). Writers stamp organization_id via
-- withTenantTransaction as they already do for this table. No new table,
-- so no new RLS helper.
--
-- ROLLBACK:
--   ALTER TABLE counter_sessions DROP CONSTRAINT IF EXISTS counter_sessions_consult_stance_chk;
--   ALTER TABLE counter_sessions DROP COLUMN IF EXISTS consult_stance;
--
-- VERIFY:
--   \d+ counter_sessions
--   SELECT consult_stance FROM counter_sessions LIMIT 1;
--
-- Plan: docs/todo/kiosk-counter-consult-PLAN.md (Phase 2).

BEGIN;

ALTER TABLE counter_sessions
  ADD COLUMN IF NOT EXISTS consult_stance TEXT NOT NULL DEFAULT 'work';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'counter_sessions_consult_stance_chk'
  ) THEN
    ALTER TABLE counter_sessions ADD CONSTRAINT counter_sessions_consult_stance_chk
      CHECK (consult_stance IN ('work', 'show', 'verify'));
  END IF;
END $$;

COMMENT ON COLUMN counter_sessions.consult_stance IS
  'Consult stance: work (staff) · show · verify. Face stays staff|customer.';

COMMIT;
