-- ============================================================================
-- 2026-08-05: platforms.color_hex — org-customizable platform accent
-- ============================================================================
-- Marketplace platforms (origin) may carry a free-form #RRGGBB accent so each
-- org can color-code custom intake channels. Paint is derived at render via
-- src/lib/color-contrast.ts (luminance-forced ink) — never store a paired
-- text color. Carrier brand hex stays in carrier-brand.ts and is NOT
-- tenant-overridable.
--
-- `tone` (Tailwind text-* class) remains as the legacy / builtin fallback
-- when color_hex is null.
--
-- Safety: additive nullable column on an already tenant-enforced table;
-- no backfill required (null = keep builtin tone).
-- Rollback: ALTER TABLE platforms DROP COLUMN IF EXISTS color_hex;
-- ============================================================================

BEGIN;

ALTER TABLE platforms
  ADD COLUMN IF NOT EXISTS color_hex varchar(7);

-- Drop + recreate so re-runs stay idempotent if the check already exists.
DO $$
BEGIN
  ALTER TABLE platforms DROP CONSTRAINT IF EXISTS platforms_color_hex_format;
  ALTER TABLE platforms
    ADD CONSTRAINT platforms_color_hex_format
    CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9a-fA-F]{6}$');
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

COMMIT;
