-- 2026-09-10b_counter_sessions_consult_presentation.sql
--
-- Show's proposal pointer (line id and/or catalog row) on the shared visit.
-- Same cart as Work/Verify — this column does not store a second cart.
--
-- SAFETY: additive jsonb NOT NULL DEFAULT '{}'::jsonb. Writers stamp
-- organization_id via withTenantTransaction. No new table / RLS helper.
--
-- ROLLBACK:
--   ALTER TABLE counter_sessions DROP COLUMN IF EXISTS consult_presentation;
--
-- VERIFY:
--   SELECT consult_presentation FROM counter_sessions LIMIT 1;
--
-- Plan: docs/todo/kiosk-counter-consult-PLAN.md (Phase 3).
-- Callers: setConsultPresentation, GET kiosk/counter session snapshots.
-- User: "continue to the next phase" + browser confirm.

BEGIN;

ALTER TABLE counter_sessions
  ADD COLUMN IF NOT EXISTS consult_presentation JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN counter_sessions.consult_presentation IS
  'Show proposal: { lineId, catalog }. Empty object = consult in progress.';

COMMIT;
