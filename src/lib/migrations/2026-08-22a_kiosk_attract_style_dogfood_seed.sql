-- ============================================================================
-- 2026-08-22a — kiosk attract face becomes a per-org setting
--
-- WHAT
--   Seeds `organizations.settings.brand.attractStyle` (plus the wordmark copy
--   and ink it paints) for the dogfood tenant, so the org that has been getting
--   the white logotype screensaver keeps getting it after the code that decided
--   that stops existing.
--
-- WHY
--   `/kiosk/v2` picked the screensaver with `data.orgId === DOGFOOD_ORG_ID`.
--   That is a tenant identity standing in for a tenant preference: every other
--   org was pinned to the welcome face with no way to change it, and the
--   wordmark's copy ('USAV' / 'Solutions') and ink (#1f316d) were hardcoded
--   defaults in AttractLoop.tsx. The preference now lives in the settings bag
--   (BrandSchema.attractStyle, resolved by src/lib/kiosk/attract-style.ts) and
--   is editable in Settings → Organization ▸ Branding.
--
--   This migration is the expand step: the tenant-specific FACT moves from code
--   into the tenant's own row FIRST, so the code that reads it can default
--   every other org to 'welcome' — the face they already had — and change
--   nobody's screen on deploy.
--
-- SCOPE — why a hardcoded UUID is right HERE and wrong in the app
--   A one-time backfill naming the row it backfills is not a tenancy gate: it
--   runs once, writes data, and never participates in a request. The banned
--   pattern is a REQUEST deciding behaviour by comparing against this UUID,
--   which is exactly what this migration exists to delete.
--
-- IDEMPOTENT / ADDITIVE
--   Every key is guarded on absence, so a re-run cannot overwrite a value an
--   admin has since changed in Settings. No DDL — `settings` is jsonb.
--
-- ROLLBACK (dev only)
--   UPDATE organizations SET settings = jsonb_set(settings, '{brand}',
--     (settings -> 'brand') - 'attractStyle')
--   WHERE id = '00000000-0000-0000-0000-000000000001';
--
-- VERIFY
--   SELECT id, settings -> 'brand' ->> 'attractStyle' AS style,
--          settings -> 'brand' ->> 'attractHeadline' AS headline,
--          settings -> 'brand' ->> 'attractSubline' AS subline,
--          settings -> 'brand' ->> 'primaryColor'   AS ink
--     FROM organizations ORDER BY created_at;
--   -- dogfood ⇒ wordmark/USAV/Solutions/#1f316d; every other org ⇒ all NULL
--   --            (NULL is the 'welcome' face, which is what they render today).
-- ============================================================================

BEGIN;

-- 1. The face. Only the dogfood org; everyone else stays unset ⇒ 'welcome'.
UPDATE organizations
SET settings = jsonb_set(
      settings,
      '{brand}',
      COALESCE(settings -> 'brand', '{}'::jsonb) || jsonb_build_object('attractStyle', 'wordmark'),
      true
    )
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND NOT (COALESCE(settings -> 'brand', '{}'::jsonb) ? 'attractStyle');

-- 2. The copy + ink the wordmark used to hardcode. AttractLoop now falls back
--    to the org display name in near-black, so these have to be real data for
--    the dogfood sign to look unchanged. Each key guarded independently: an
--    admin who already typed a headline keeps it.
UPDATE organizations
SET settings = jsonb_set(
      settings,
      '{brand}',
      COALESCE(settings -> 'brand', '{}'::jsonb) || jsonb_build_object('attractHeadline', 'USAV'),
      true
    )
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND COALESCE(BTRIM(settings -> 'brand' ->> 'attractHeadline'), '') = '';

UPDATE organizations
SET settings = jsonb_set(
      settings,
      '{brand}',
      COALESCE(settings -> 'brand', '{}'::jsonb) || jsonb_build_object('attractSubline', 'Solutions'),
      true
    )
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND COALESCE(BTRIM(settings -> 'brand' ->> 'attractSubline'), '') = '';

-- The tenant's navy, sampled from the dominant pixel of public/images/
-- usav-logo.png. It was a constant in AttractLoop.tsx; it is brand DATA and
-- belongs on the brand's row.
UPDATE organizations
SET settings = jsonb_set(
      settings,
      '{brand}',
      COALESCE(settings -> 'brand', '{}'::jsonb) || jsonb_build_object('primaryColor', '#1f316d'),
      true
    )
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND COALESCE(BTRIM(settings -> 'brand' ->> 'primaryColor'), '') = '';

COMMIT;
