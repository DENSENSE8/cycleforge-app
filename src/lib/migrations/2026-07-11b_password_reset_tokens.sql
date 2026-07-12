-- ============================================================================
-- 2026-07-11b_password_reset_tokens.sql
--
-- Account-based password reset. One-time, expiring, HASHED tokens (the raw token
-- lives ONLY in the emailed URL; we store sha256). Keyed by the GLOBAL account —
-- password reset is a cross-org identity operation, not an org-scoped one.
--
-- Like email_login_tokens / staff_sessions, this is an AUTH PRIMITIVE resolved
-- pre-session (by a cross-org email lookup on the owner pool). It is deliberately
-- NOT FORCE-RLS'd and carries no organization_id — accounts are global.
--
-- Distinct from email_login_tokens on purpose: a magic-LOGIN token mints a
-- session on verify; a RESET token only authorizes setting a new password. They
-- must not share a table, or a reset link would become a login link.
--
-- UNAPPLIED — authored only. Apply via /db-migrate (do not drizzle-kit push).
-- ============================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          bigserial PRIMARY KEY,
  account_id  uuid    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash  text    NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  requested_ip text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_account ON password_reset_tokens (account_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens (expires_at);
