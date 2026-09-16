-- ============================================================================
-- 2026-09-15e_integration_shared_access_tokens.sql
--
-- Two fixes for the 2026-09-14 Zoho blackout (see docs/integrations/zoho.md):
--
-- 1. SHARED ACCESS TOKENS. Each serverless instance cached its minted OAuth
--    access token in-process, so the token endpoint was hit once per cold
--    lambda / health poll / cron tick. Zoho caps minting at 10 access tokens
--    per refresh token per 10 minutes; we crossed it and the mint started
--    failing with "Access Denied … too many requests continuously".
--    These columns give every instance ONE token per connection per hour
--    (src/lib/integrations/access-token-store.ts).
--
-- 2. UN-LATCH TRANSIENT FAILURES. That throttle was classified as a dead
--    credential, flipping status to 'error'. Nothing clears 'error' but a
--    human re-running OAuth, so Zoho stayed offline 25 h and cartons could
--    not be pushed as received. The classifier now treats throttles as
--    transient (src/lib/integrations/credential-auth-failure.ts); this
--    migration releases the rows already latched by that misclassification.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + a filtered UPDATE.
-- ============================================================================

BEGIN;

-- 1. Shared, encrypted access-token cache on the existing connection row.
--    Encrypted with the same INTEGRATION_KMS_KEY envelope as payload_encrypted.
ALTER TABLE organization_integrations
  ADD COLUMN IF NOT EXISTS access_token_encrypted  TEXT,
  ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN organization_integrations.access_token_encrypted IS
  'Fleet-shared OAuth access token (AES-256-GCM envelope). Minted once per expiry window under an advisory lock so N instances cause 1 upstream mint, not N. Never a refresh token — that lives in payload_encrypted.';
COMMENT ON COLUMN organization_integrations.access_token_expires_at IS
  'Expiry of access_token_encrypted. Readers apply a 5-minute skew before reuse.';

-- 2. Release connections latched off by a TRANSIENT provider failure. Genuine
--    auth deaths (invalid_grant / revoked refresh token / invalid_client) stay
--    'error' so they keep surfacing as "Needs attention".
UPDATE organization_integrations
   SET status     = 'active',
       last_error = NULL,
       updated_at = now()
 WHERE status = 'error'
   AND last_error IS NOT NULL
   AND (
     last_error ILIKE '%too many requests%'
     OR last_error ILIKE '%try again after some time%'
     OR last_error ILIKE '%rate limit%'
     OR last_error ILIKE '%timed out%'
     OR last_error ILIKE '%timeout%'
     OR last_error ILIKE '%ECONNRESET%'
     OR last_error ILIKE '%fetch failed%'
   );

COMMIT;
