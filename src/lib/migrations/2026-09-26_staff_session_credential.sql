-- ============================================================================
-- 2026-09-26_staff_session_credential.sql
--
-- Which door a session was minted for: the browser cookie or the native bearer.
--
-- WHY. POST /api/v1/session hands a native client (iOS / Android / desktop) its
-- staff_sessions sid as `Authorization: Bearer`. Without a marker, a token
-- lifted from a phone could be planted as a `cf_sid` cookie and would open
-- every web route, not just /api/v1. With it, loadSession() matches the sid AND
-- the credential it arrived on, so a bearer row never authenticates a cookie
-- and a cookie row never authenticates a bearer.
--
--   staff_sessions.credential   'cookie' (every browser sign-in) | 'bearer'
--
-- System table (auth), already carries organization_id — no tenant change.
--
-- SAFETY. Additive, NOT NULL DEFAULT 'cookie': every existing row is a browser
-- session and stays valid; writers that do not pass the column keep today's
-- behaviour. Apply BEFORE the code that filters on it (expand → code), or the
-- auth hot path errors on the missing column.
--
-- ROLLBACK.
--   ALTER TABLE staff_sessions DROP CONSTRAINT IF EXISTS staff_sessions_credential_check;
--   ALTER TABLE staff_sessions DROP COLUMN IF EXISTS credential;
-- (Only after reverting the code that reads it.)
--
-- VERIFY.
--   SELECT credential, count(*) FROM staff_sessions GROUP BY 1;   -- all 'cookie'
-- ============================================================================

ALTER TABLE staff_sessions
  ADD COLUMN IF NOT EXISTS credential TEXT NOT NULL DEFAULT 'cookie';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_sessions_credential_check'
  ) THEN
    ALTER TABLE staff_sessions
      ADD CONSTRAINT staff_sessions_credential_check CHECK (credential IN ('cookie', 'bearer'));
  END IF;
END $$;
