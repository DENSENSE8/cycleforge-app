-- ============================================================================
-- 2026-10-08b: types.short_label + label-face repair for platforms / types
-- ============================================================================
-- Operator 2026-10-08: "the labels and the platforms and the types should
-- have a small label, small text variant just for it being on a label and the
-- actual name of the type and the platform. For example, return is rtr but it
-- should say return when you are viewing the type and the platform."
--
-- Two faces, one row:
--   `label`       — the display name. Every picker, pill, menu, chip, sidebar
--                   facet and record field ("Return", "Amazon").
--   `short_label` — the label face. The printed 2x1 sticker and its on-screen
--                   preview only ("RTR", "AMZ"). NULL = print the display name.
-- Platforms got `short_label` on 2026-09-24; types get the same column with
-- the identical CHECK (upper-case, trimmed, 1..8 — the 2x1 top-left slot).
--
-- Orgs had typed sticker words into `label` ('RTR', 'AMZ', 'WALMT'), so every
-- screen read "Rtr". The repair moves each sticker word into `short_label`
-- and restores a readable display name:
--   (a) built-in rows (is_system) whose label differs from the seed name and
--       fits the slot (≤ 8): short_label := COALESCE(short_label,
--       upper(label)); label := seed name (VALUES below mirror SEED_PLATFORMS
--       / SEED_TYPES in src/lib/neon/catalog-queries.ts). A longer label is a
--       deliberate rename, not a sticker word — left alone.
--   (b) org rows (NOT is_system) whose label is ALL CAPS (no lower-case
--       letters) and 4..8 chars: short_label := COALESCE(short_label, label);
--       label := initcap(lower(label)). 3-letter acronyms ('DHL', 'FBA') stay.
-- `platform_accounts` is untouched: connection names ('MEKONG', 'USAV') are
-- upper-case on purpose.
--
-- Expected, org 00000000-0000-0000-0000-000000000001 (label → label / short_label):
--   types      return      RTR       → Return     / RTR
--   types      unfound     UNFOUND   → Unfound    / UNFOUND
--   platforms  amazon      AMZ       → Amazon     / AMZ
--   platforms  aliexpress  AliEx     → AliExpress / ALIEX
--   platforms  walmart     WALMT     → Walmart    / WALMT
--   platforms  goodwill    GW        → Goodwill   / GW
--   platforms  best_buy    BEST BUY  → Best Buy   / BEST BUY
--   platforms  trade_in    TRADE-IN  → Trade-In   / TRADE-IN
--   platforms  repair      REPAIR    → Repair     / REPAIR
-- Every other org already carries the seed names: no rows change there.
--
-- Safety: one additive nullable column on an already tenant-enforced table;
-- the data repair rewrites display text only — every stored record value
-- (receiving.source_platform, receiving_type, intake_type …) is a SLUG, never
-- a label, so no reference moves. Cross-org UPDATEs run as the migration
-- owner (BYPASSRLS). Writers of types.short_label are the catalog PATCH route
-- only (tenant-scoped). Idempotent: a second run finds the seed names /
-- mixed-case labels and matches nothing.
-- Rollback: the display-name repair is a text rewrite — snapshot first
--   (SELECT id, slug, label, short_label FROM platforms; … FROM types) and
--   restore `label` / platforms.`short_label` from that snapshot if needed;
--   ALTER TABLE types DROP COLUMN IF EXISTS short_label;
-- Verify:
--   SELECT 'platform' AS kind, organization_id, slug, label, short_label, is_system
--     FROM platforms WHERE short_label IS NOT NULL
--   UNION ALL
--   SELECT 'type', organization_id, slug, label, short_label, is_system
--     FROM types WHERE short_label IS NOT NULL
--   ORDER BY organization_id, kind, slug;
--   -- and nothing left shouting on screen:
--   SELECT organization_id, slug, label FROM types
--    WHERE label = upper(label) AND char_length(label) BETWEEN 4 AND 8;
-- ============================================================================

BEGIN;

ALTER TABLE types
  ADD COLUMN IF NOT EXISTS short_label text;

-- Drop + recreate so re-runs stay idempotent if the check already exists.
DO $$
BEGIN
  ALTER TABLE types DROP CONSTRAINT IF EXISTS types_short_label_format;
  ALTER TABLE types
    ADD CONSTRAINT types_short_label_format
    CHECK (
      short_label IS NULL
      OR (short_label = upper(short_label)
          AND short_label = btrim(short_label)
          AND char_length(short_label) BETWEEN 1 AND 8)
    );
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

-- (a) built-in rows: sticker word → short_label, seed name → label.
UPDATE platforms p
   SET short_label = COALESCE(p.short_label, upper(btrim(p.label))),
       label       = seed.label
  FROM (VALUES
          ('ebay', 'eBay'),
          ('amazon', 'Amazon'),
          ('fba', 'FBA'),
          ('aliexpress', 'AliExpress'),
          ('walmart', 'Walmart'),
          ('goodwill', 'Goodwill'),
          ('ecwid', 'Ecwid'),
          ('other', 'Other')
       ) AS seed(slug, label)
 WHERE p.is_system
   AND p.slug = seed.slug
   AND p.label IS DISTINCT FROM seed.label
   AND char_length(btrim(p.label)) BETWEEN 1 AND 8;

UPDATE types t
   SET short_label = COALESCE(t.short_label, upper(btrim(t.label))),
       label       = seed.label
  FROM (VALUES
          ('po', 'PO'),
          ('return', 'Return'),
          ('repair', 'Repair'),
          ('repair_service', 'Repair Service'),
          ('repair_return', 'Repair Return'),
          ('trade_in', 'Trade In'),
          ('pickup', 'Pick Up')
       ) AS seed(slug, label)
 WHERE t.is_system
   AND t.slug = seed.slug
   AND t.label IS DISTINCT FROM seed.label
   AND char_length(btrim(t.label)) BETWEEN 1 AND 8;

-- (b) org rows typed in capitals: keep the capitals as the sticker word,
-- title-case the display name. `label = upper(label)` ⇔ no lower-case letter;
-- `~ '[A-Z]'` skips digit/punctuation-only labels.
UPDATE platforms
   SET short_label = COALESCE(short_label, btrim(label)),
       label       = initcap(lower(btrim(label)))
 WHERE NOT is_system
   AND label = upper(label)
   AND label ~ '[A-Z]'
   AND char_length(btrim(label)) BETWEEN 4 AND 8;

UPDATE types
   SET short_label = COALESCE(short_label, btrim(label)),
       label       = initcap(lower(btrim(label)))
 WHERE NOT is_system
   AND label = upper(label)
   AND label ~ '[A-Z]'
   AND char_length(btrim(label)) BETWEEN 4 AND 8;

COMMIT;
