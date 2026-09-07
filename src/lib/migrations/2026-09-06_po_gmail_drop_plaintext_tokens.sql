-- 2026-09-06 — Drop the plaintext OAuth token columns from google_oauth_tokens.
--
-- PO Gmail tokens now live exclusively in the integrations vault
-- (organization_integrations, provider='gmail', payload_encrypted — an
-- AES-256-GCM envelope under INTEGRATION_KMS_KEY), written by
-- /api/admin/po-gmail/oauth-callback and backfilled by
-- scripts/backfill-po-gmail-vault.mjs. Run that backfill (dry-run by default,
-- --apply executes) BEFORE this migration so no live token is lost.
--
-- The only other provider in this table is 'google_photos' — that token row
-- has had no runtime reader since photo backup moved to Google Drive
-- (GoogleDriveCredentials); its expired plaintext tokens are simply discarded.
-- The surviving columns (provider, account_email, scope, expires_at,
-- connected_by_staff_id, needs_reconnect, …) keep the table usable as
-- connection metadata; src/lib/po-gmail/client.ts no longer reads it.
--
-- Idempotent: each DROP runs only when the column still exists.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'google_oauth_tokens'
       AND column_name  = 'refresh_token'
  ) THEN
    ALTER TABLE google_oauth_tokens DROP COLUMN refresh_token;
    RAISE NOTICE 'po_gmail_drop_plaintext: dropped google_oauth_tokens.refresh_token';
  ELSE
    RAISE NOTICE 'po_gmail_drop_plaintext: google_oauth_tokens.refresh_token already absent';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'google_oauth_tokens'
       AND column_name  = 'access_token'
  ) THEN
    ALTER TABLE google_oauth_tokens DROP COLUMN access_token;
    RAISE NOTICE 'po_gmail_drop_plaintext: dropped google_oauth_tokens.access_token';
  ELSE
    RAISE NOTICE 'po_gmail_drop_plaintext: google_oauth_tokens.access_token already absent';
  END IF;
END $$;

COMMIT;
