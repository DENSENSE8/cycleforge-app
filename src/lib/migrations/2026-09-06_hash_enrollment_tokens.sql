-- ============================================================================
-- 2026-09-06_hash_enrollment_tokens.sql
--
-- staff_enrollments.token held RAW 24-byte base64url enrollment tokens: a
-- leaked DB row was a replayable credential (set PIN -> phone session). Align
-- with the other one-time token tables (password_reset_tokens.token_hash,
-- email_login_tokens.token_hash, invitations): persist sha256 only.
--
-- App change (same deploy): src/lib/auth/enrollment.ts hashes on write and
-- compares by hash on read (hashEnrollmentToken); the legacy
-- /api/admin/staff/invite direct INSERT stores the digest too. The raw token
-- lives only in the QR / invite URL.
--
-- Idempotent: the guard skips rows that already look like a 64-hex digest, so
-- re-runs are no-ops. A raw token is 32 chars of base64url and can never match
-- ^[0-9a-f]{64}$, so the guard cannot skip an unhashed row.
--
-- Token lifecycle is unchanged: single-use (consumed_at) + expiry (expires_at;
-- 24h via enroll-token/reset-pin, 14d via the legacy invite). Rows are hashed
-- in place rather than deleted to preserve audit history (both live rows
-- pre-migration were already expired, so no in-flight enrollment depends on
-- the old plaintext values).
--
-- pgcrypto (1.3) is installed -> digest(). encode(..., 'hex') matches the
-- lowercase hex of Node's createHash('sha256').digest('hex').
--
-- Verify after apply:
--   SELECT count(*) FROM staff_enrollments WHERE token !~ '^[0-9a-f]{64}$';
--   -- must be 0
-- ============================================================================

BEGIN;

UPDATE staff_enrollments
   SET token = encode(digest(token, 'sha256'), 'hex')
 WHERE token !~ '^[0-9a-f]{64}$';

COMMIT;
