-- ============================================================================
-- Drop seeded '/dashboard' per-staff homes.
-- ============================================================================
-- What + why: invite and SSO auto-provisioning used to seed
-- staff.default_home_path = '/dashboard'. /dashboard is no longer a home (it
-- only redirects to /shipping/orders); non-station roles now land on Daily
-- ('/'), station roles on their station. A seeded '/dashboard' override would
-- beat that role precedence, so NULL it out and let role precedence decide.
--
-- Safety gating: the writers (invite + SSO callback) no longer insert
-- '/dashboard' in the same change. Pure data cleanup on existing columns;
-- no tenant scoping change (staff is already tenant-scoped).
--
-- Idempotent: re-running matches zero rows; DROP DEFAULT is a no-op when no
-- default is set.
--
-- Rollback: none needed/possible (the '/dashboard' values were seeds, not
-- admin choices worth restoring).
--
-- Verify:
--   SELECT count(*) FROM staff
--   WHERE default_home_path LIKE '/dashboard%' OR default_home_path_mobile LIKE '/dashboard%';
-- ============================================================================

BEGIN;

ALTER TABLE staff ALTER COLUMN default_home_path DROP DEFAULT;
ALTER TABLE staff ALTER COLUMN default_home_path_mobile DROP DEFAULT;

UPDATE staff SET default_home_path = NULL
WHERE default_home_path = '/dashboard' OR default_home_path LIKE '/dashboard?%';

UPDATE staff SET default_home_path_mobile = NULL
WHERE default_home_path_mobile = '/dashboard' OR default_home_path_mobile LIKE '/dashboard?%';

COMMIT;
