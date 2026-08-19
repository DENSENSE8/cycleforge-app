-- ============================================================================
-- 2026-08-19: types.color_hex — org-customizable receiving-type accent
-- ============================================================================
-- Sibling of platforms.color_hex (2026-08-05). A type pill's dot is painted
-- from the built-in RECEIVING_TYPES registry (blue PO, rose Return, …), which
-- has no answer for a custom type an org invents — every one of those landed
-- on the same neutral tag face. This lets an org pin any type to a free-form
-- #RRGGBB accent; ink/soft fill are DERIVED at render via
-- src/lib/color-contrast.ts (platformPaintFromHex), never stored as a pair.
--
-- Null = keep the built-in registry tone. The registry stays the SoT for
-- label / short / icon; only the accent is overridable — same split as
-- platforms, where `tone` remains the builtin fallback under color_hex.
--
-- Safety: additive nullable column on an already tenant-enforced table
-- (types carries organization_id NOT NULL + RLS from 2026-06-14b); no
-- backfill required.
-- Rollback: ALTER TABLE types DROP COLUMN IF EXISTS color_hex;
-- ============================================================================

BEGIN;

ALTER TABLE types
  ADD COLUMN IF NOT EXISTS color_hex varchar(7);

-- Drop + recreate so re-runs stay idempotent if the check already exists.
DO $$
BEGIN
  ALTER TABLE types DROP CONSTRAINT IF EXISTS types_color_hex_format;
  ALTER TABLE types
    ADD CONSTRAINT types_color_hex_format
    CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9a-fA-F]{6}$');
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

COMMIT;
