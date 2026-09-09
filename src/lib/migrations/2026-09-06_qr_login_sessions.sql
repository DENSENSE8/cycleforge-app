-- ============================================================================
-- 2026-09-06_qr_login_sessions.sql
--
-- Cross-device QR code sign-in handshakes (desktop displays QR -> phone scans
-- and verifies with Face ID / Passkey -> desktop auto-authenticates).
--
-- Stores pending handshakes keyed by SHA-256(token) so tokens are hashed at rest.
-- ============================================================================

CREATE TABLE IF NOT EXISTS qr_login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'authorized' | 'consumed' | 'expired'
  staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE,
  organization_id UUID,
  device_kind TEXT NOT NULL DEFAULT 'personal',
  persistent BOOLEAN NOT NULL DEFAULT false,
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  authorized_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_qr_login_sessions_token_hash ON qr_login_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_qr_login_sessions_expires_at ON qr_login_sessions(expires_at);

COMMENT ON TABLE qr_login_sessions IS 'Cross-device QR sign-in handshakes (desktop display -> phone Face ID / biometric authorization).';
