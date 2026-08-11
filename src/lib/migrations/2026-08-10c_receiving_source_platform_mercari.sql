-- ============================================================================
-- 2026-08-10c_receiving_source_platform_mercari.sql
--
-- Grow receiving_carton.source_platform CHECK so it stays a superset of
-- SOURCE_PLATFORMS after Zoho/Mercari joined the mark registry (ops UI channel
-- face = PlatformMark; Product Hub retired its page-local platform-style twin).
-- Zoho was already allowed; Mercari is the net-new value.
--
-- Safety: additive allowlist only — existing rows unchanged.
-- Rollback:
--   ALTER TABLE receiving_carton DROP CONSTRAINT IF EXISTS receiving_source_platform_chk;
--   ALTER TABLE receiving_carton ADD CONSTRAINT receiving_source_platform_chk
--     CHECK (source_platform IS NULL OR source_platform IN
--       ('zoho','ebay','amazon','fba','aliexpress','walmart','goodwill','ecwid',
--        'square','shopify','other'));
-- Verify: \d receiving_carton — constraint lists mercari.
-- ============================================================================

BEGIN;

ALTER TABLE receiving_carton DROP CONSTRAINT IF EXISTS receiving_source_platform_chk;

ALTER TABLE receiving_carton
  ADD CONSTRAINT receiving_source_platform_chk
  CHECK (
    source_platform IS NULL
    OR source_platform IN (
      'zoho',
      'ebay',
      'amazon',
      'fba',
      'aliexpress',
      'walmart',
      'goodwill',
      'ecwid',
      'square',
      'shopify',
      'mercari',
      'other'
    )
  );

COMMIT;
