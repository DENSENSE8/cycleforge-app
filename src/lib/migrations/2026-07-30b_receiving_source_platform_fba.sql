-- ============================================================================
-- 2026-07-30b_receiving_source_platform_fba.sql
--
-- receiving_carton.source_platform CHECK constraint (receiving_source_platform_chk,
-- carried over unrenamed from the pre-2026-07-05d `receiving` table) never grew
-- past { zoho, ebay, amazon, aliexpress, walmart, other, goodwill, ecwid } — it
-- missed fba/shopify/square when those were added to the app-level SoT
-- (src/lib/source-platform.ts). The PATCH /api/receiving/:id allowlist was
-- fixed to derive from that SoT (source-platform-allowlist.guard.test.ts), so
-- classifying Platform=FBA now PASSES app validation and 500s at the DB
-- ("violates check constraint receiving_source_platform_chk") instead of
-- 400ing — the pill painted FBA while the write silently failed and the claim
-- subject stayed "Unknown - Return" (docs/todo/claim-subject-fba-unknown-HANDOFF.md).
--
-- Fix: re-cut the constraint from the full SOURCE_PLATFORMS registry so it can
-- never again miss a platform the app already allows.
--
-- Rollback:
--   ALTER TABLE receiving_carton DROP CONSTRAINT IF EXISTS receiving_source_platform_chk;
--   ALTER TABLE receiving_carton ADD CONSTRAINT receiving_source_platform_chk
--     CHECK (source_platform IS NULL OR source_platform IN
--       ('zoho','ebay','amazon','aliexpress','walmart','other','goodwill','ecwid'));
-- Verify: \d receiving_carton  — constraint lists fba/shopify/square too.
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
      'other'
    )
  );

COMMIT;
