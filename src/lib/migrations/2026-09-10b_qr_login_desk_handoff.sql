-- ============================================================================
-- 2026-09-10b_qr_login_desk_handoff.sql
--
-- Desk → phone session handoff: a signed-in desk mints a one-time QR that the
-- phone claims into a phone session. Extends `qr_login_sessions` with a `flow`
-- discriminator so we do not invert the existing phone→desk authorize/claim
-- path.
--
-- Callers: /api/auth/qr/handoff/begin (auth), /api/auth/qr/handoff/claim (public),
-- /m/claim, PhoneHandoffQrDialog. User: implement B (desk→phone handoff).
--
-- Safety: additive columns with defaults; existing rows stay phone_to_desk.
-- Rollback: DROP COLUMN flow, short_code (and the partial unique index).
-- Verify: SELECT flow, COUNT(*) FROM qr_login_sessions GROUP BY flow;
-- ============================================================================

ALTER TABLE qr_login_sessions
  ADD COLUMN IF NOT EXISTS flow TEXT NOT NULL DEFAULT 'phone_to_desk';

ALTER TABLE qr_login_sessions
  ADD COLUMN IF NOT EXISTS short_code TEXT;

COMMENT ON COLUMN qr_login_sessions.flow IS
  'phone_to_desk = desk shows QR, phone authorizes; desk_to_phone = desk (signed in) mints QR, phone claims session.';

COMMENT ON COLUMN qr_login_sessions.short_code IS
  'Human pairing code (e.g. 7K4M) for desk_to_phone; displayed as CF-XXXX. Null for phone_to_desk.';

-- At most one live desk→phone handoff may reuse a short code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_login_sessions_short_code_live
  ON qr_login_sessions (short_code)
  WHERE short_code IS NOT NULL
    AND status IN ('pending', 'authorized');
