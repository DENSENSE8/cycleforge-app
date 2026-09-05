-- ============================================================================
-- 2026-09-04b — counter_sessions.active_command += 'exchange'
--
-- The front door for the in-store channel exchange
-- (docs/todo/counter-channel-exchange-PLAN.md §CX4). A customer who bought on
-- the online store walks in to return it and buy a replacement; "Exchange" is
-- the command the tablet and the desk switch the work surface to.
--
-- LOCKSTEP (plan §6) — these four must move together, and this file is one of
-- them:
--   1. counter_sessions_active_command_chk        (here)
--   2. KioskCommandId                             src/lib/kiosk/kiosk-session-store.ts
--   3. KIOSK_SERVICES / KioskServiceId            src/lib/kiosk/services.ts
--   4. counterSessions.activeCommand comment      src/lib/drizzle/schema.ts
-- A command the UI can select but the CHECK rejects strands a tablet mid-visit
-- with a 500 nobody can read.
--
-- WHY A COMMAND AND NOT A LINE TYPE (plan X3)
--   The channel return is visit metadata; the REPLACEMENT is an ordinary RETAIL
--   line. KIOSK_LINE_TYPES stays RETAIL | REPAIR | BUYBACK. Pickup is the
--   existing precedent for command-not-line, and this follows it exactly.
--
-- SAFETY
--   DROP + re-ADD of a CHECK is the only way to widen one. It is additive
--   (every value the old constraint allowed, the new one allows), so no
--   existing row can fail validation and no rewrite is triggered beyond the
--   constraint re-check.
--
-- ROLLBACK
--   Only safe once no session sits on 'exchange':
--     UPDATE counter_sessions SET active_command = 'retail'
--      WHERE active_command = 'exchange';
--     ALTER TABLE counter_sessions DROP CONSTRAINT counter_sessions_active_command_chk;
--     ALTER TABLE counter_sessions ADD CONSTRAINT counter_sessions_active_command_chk
--       CHECK (active_command IN ('retail','repair','buyback','pickup'));
-- ============================================================================

BEGIN;

ALTER TABLE counter_sessions
  DROP CONSTRAINT IF EXISTS counter_sessions_active_command_chk;

ALTER TABLE counter_sessions
  ADD CONSTRAINT counter_sessions_active_command_chk
  CHECK (active_command IN ('retail', 'repair', 'buyback', 'pickup', 'exchange'));

COMMIT;
