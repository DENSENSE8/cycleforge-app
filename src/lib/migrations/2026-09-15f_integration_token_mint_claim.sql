-- ============================================================================
-- 2026-09-15f_integration_token_mint_claim.sql
--
-- Cross-instance mint coordination for the shared access-token cache added in
-- 2026-09-15e. One column: which instance currently owns the right to hit the
-- provider's token endpoint.
--
-- Why not an advisory lock: the first cut held `pg_advisory_lock` on a
-- checked-out client while minting. With PG_POOL_MAX=5 a measured 12-caller
-- stampede exhausted the pool ("timeout exceeded when trying to connect") and
-- every caller fell through to its own mint — 12 mints, i.e. the exact Zoho
-- throttle this work exists to prevent. This claim is a short
-- UPDATE … RETURNING: no connection is held across the network call.
--
-- Stale claims (crashed minter) are re-claimable after 30 s; see
-- MINT_CLAIM_TTL_SEC in src/lib/integrations/access-token-store.ts.
-- ============================================================================

BEGIN;

ALTER TABLE organization_integrations
  ADD COLUMN IF NOT EXISTS access_token_mint_claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN organization_integrations.access_token_mint_claimed_at IS
  'Set while one instance is minting an access token; re-claimable after 30s so a crashed minter cannot wedge minting. NULL when idle.';

COMMIT;
