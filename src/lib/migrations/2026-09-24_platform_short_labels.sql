-- ============================================================================
-- 2026-09-24: platforms.short_label + platform_accounts.short_label
-- ============================================================================
-- Owner 2026-09-24: "edit the DISPLAY LABEL for the platform and the platform
-- CONNECTION NAME — e.g. 'Amazon Renewed' would be labeled 'AMZRN' so it fits
-- on a small 2x1 label."
--
-- `label` stays the full display name (pickers, evidence, tooltips). The new
-- `short_label` is the dense face: the 2x1 carton label's platform slot, the
-- To-ship ledger's band 1, the phone record's band 1, the compact carton pill.
-- Orgs had been abusing `label` for this ('AMZ', 'ECW', 'WALMT'), which made the
-- full name unrecoverable everywhere else.
--
-- Two grains, because `orders.account_source` is hybrid: it holds a platform
-- slug ('amazon', 'ecwid') OR a connection name ('MEKONG', 'USAV', 'DRAGON').
-- A connection's short label wins over its platform's; either falls back to
-- the built-in compact ('amazon' → 'AMZ') and then the full label at render
-- (src/lib/platform-display.ts). NULL = no override.
--
-- Stored upper-case, ≤ 8 characters (the 2x1 top-left slot), never blank —
-- the CHECK is the guard; the API normalizes (trim + upper-case) before write.
--
-- Safety: additive nullable columns on already tenant-enforced tables; no
-- backfill (NULL = keep the built-in fallback). Every writer is the catalog
-- PATCH routes, which already run tenant-scoped.
-- Rollback:
--   ALTER TABLE platforms         DROP COLUMN IF EXISTS short_label;
--   ALTER TABLE platform_accounts DROP COLUMN IF EXISTS short_label;
-- Verify:
--   SELECT slug, label, short_label FROM platforms ORDER BY organization_id, sort_order;
-- ============================================================================

BEGIN;

ALTER TABLE platforms
  ADD COLUMN IF NOT EXISTS short_label text;

ALTER TABLE platform_accounts
  ADD COLUMN IF NOT EXISTS short_label text;

-- Drop + recreate so re-runs stay idempotent if the checks already exist.
DO $$
BEGIN
  ALTER TABLE platforms DROP CONSTRAINT IF EXISTS platforms_short_label_format;
  ALTER TABLE platforms
    ADD CONSTRAINT platforms_short_label_format
    CHECK (
      short_label IS NULL
      OR (short_label = upper(short_label)
          AND short_label = btrim(short_label)
          AND char_length(short_label) BETWEEN 1 AND 8)
    );

  ALTER TABLE platform_accounts DROP CONSTRAINT IF EXISTS platform_accounts_short_label_format;
  ALTER TABLE platform_accounts
    ADD CONSTRAINT platform_accounts_short_label_format
    CHECK (
      short_label IS NULL
      OR (short_label = upper(short_label)
          AND short_label = btrim(short_label)
          AND char_length(short_label) BETWEEN 1 AND 8)
    );
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

COMMIT;
