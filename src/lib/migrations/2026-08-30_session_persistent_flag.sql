-- ============================================================================
-- 2026-08-30_session_persistent_flag.sql
--
-- "Keep me signed in" becomes a property of the SESSION, not of the staff row.
--
-- WHY. The sign-in checkbox only ever set device_kind ('personal' vs
-- 'station'). 'personal' means a 12-hour IDLE window, and loadSession()
-- auto-REVOKES a row that crosses it — so "Keep me signed in / 30 days" was
-- false for anyone who went home for the night. The policy that actually does
-- what the checkbox promises ('persistent': no idle, 1-year sliding absolute)
-- already existed, but only as per-staff admin config (staff.session_policy),
-- unreachable from the checkbox. These columns make it a per-sign-in,
-- per-device choice.
--
--   staff_sessions.persistent   this session was minted with the box checked
--   sso_auth_state.persistent   carries that choice across the IdP round trip
--                               (the OIDC state row is the only thing that
--                               survives the redirect; the platform-OAuth flow
--                               carries it in its httpOnly state cookie and
--                               needs no column)
--
-- The sso_auth_state half is guarded on the table existing — see the DO-block.
--
-- SAFETY. Additive and defaulted false, so it is safe to apply ahead of the
-- code: every existing row and every writer that does not yet pass the flag
-- keeps exactly today's behaviour. The reverse (code before column) would
-- break the auth hot path, hence expand → code → contract.
--
-- Per-staff session_policy = 'persistent' keeps working unchanged; the session
-- flag ORs with it, it does not replace it.
--
-- ROLLBACK.
--   ALTER TABLE staff_sessions DROP COLUMN IF EXISTS persistent;
--   ALTER TABLE sso_auth_state DROP COLUMN IF EXISTS persistent;
-- (Dropping only reverts the sessions to their device-kind windows; no data
-- outside these two columns is touched.)
--
-- VERIFY.
--   SELECT sid, device_kind, persistent, expires_at FROM staff_sessions
--    ORDER BY created_at DESC LIMIT 5;
--
-- TENANCY. staff_sessions and sso_auth_state are keyed by staff_id / state and
-- already carry organization_id; adding a boolean changes no key, index, or
-- RLS policy, so no enforce_tenant_isolation() call belongs here.
-- ============================================================================

ALTER TABLE staff_sessions
  ADD COLUMN IF NOT EXISTS persistent BOOLEAN NOT NULL DEFAULT false;

-- sso_auth_state is guarded: it is created by 2026-05-23_sso_providers.sql, and
-- at least one environment has that file in the ledger without the table (the
-- SSO tables were dropped there). A missing table is not a reason to block the
-- session flag, so skip it loudly instead of failing the whole migration; the
-- SSO callback reads the column as `=== true`, so its absence degrades to
-- "federated sign-in is not persistent", never to a crash.
DO $$
BEGIN
  IF to_regclass('public.sso_auth_state') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE sso_auth_state ADD COLUMN IF NOT EXISTS persistent BOOLEAN NOT NULL DEFAULT false';
    EXECUTE 'COMMENT ON COLUMN sso_auth_state.persistent IS ' ||
      quote_literal('Carries the sign-in page''s "Keep me signed in" choice across the OIDC redirect so /api/auth/sso/callback can mint the session with the same persistence the user asked for.');
  ELSE
    RAISE NOTICE 'sso_auth_state absent — skipping its persistent column (SSO sign-in will not be persistent here)';
  END IF;
END $$;

COMMENT ON COLUMN staff_sessions.persistent IS 'Per-sign-in "Keep me signed in": true means no idle timeout and a 1-year sliding absolute window (PERSISTENT_WINDOW), and shift-end expiry is ignored. ORs with staff.session_policy = ''persistent''.';