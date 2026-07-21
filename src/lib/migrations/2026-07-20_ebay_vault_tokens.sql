-- ============================================================================
-- 2026-07-20_ebay_vault_tokens.sql
--
-- eBay vault migration (INT-001 / INT-002):
--   Per-account user OAuth tokens move to organization_integrations
--   (provider='ebay', scope='seller:{slug}' | 'buyer:{slug}').
--   ebay_accounts becomes metadata-only (label, role, expiry watermarks).
--
-- Also drops the dual-use token columns that previously held Zoho's
-- ZOHO_MAIN refresh token — Zoho resolves from vault / ZOHO_REFRESH_TOKEN env
-- (INT-002). Run scripts/migrate-ebay-tokens-to-vault.ts --apply BEFORE this
-- migration in production so live eBay tokens are copied into the vault.
--
-- Idempotent: columns may already be gone on DBs that never had them or that
-- already ran a partial drop.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ebay_accounts' AND column_name = 'access_token'
  ) THEN
    ALTER TABLE ebay_accounts ALTER COLUMN access_token DROP NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ebay_accounts' AND column_name = 'refresh_token'
  ) THEN
    ALTER TABLE ebay_accounts ALTER COLUMN refresh_token DROP NOT NULL;
  END IF;
END $$;

-- Secrets leave this table — vault is SoT.
ALTER TABLE ebay_accounts DROP COLUMN IF EXISTS access_token;
ALTER TABLE ebay_accounts DROP COLUMN IF EXISTS refresh_token;

COMMIT;
