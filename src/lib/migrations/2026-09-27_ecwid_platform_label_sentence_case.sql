-- Ecwid platform + default-account labels → sentence case "Ecwid" (owner 2026-09-27).
--
-- What: every org's `platforms` row with slug 'ecwid' and every 'ecwid-main'
-- default account still carries a legacy face — 'ECWID-RS' (the 2026-06-13g
-- seed), 'ECWID', or the operator-typed 'ECW'. Order cards now print the full
-- platform label, so those faces reached the To-ship list. The code seed
-- (`SEED_PLATFORMS` in src/lib/neon/catalog-queries.ts) and the built-in face
-- (`source-platform.ts`) are already 'Ecwid'; this aligns the stored rows.
--
-- Safety: data-only, idempotent. Only rows whose label is one of the three
-- legacy faces change — a custom storefront name is left alone. Slugs are
-- untouched, so `account_source` resolution is unchanged.
--
-- Rollback: UPDATE the rows back to their prior label (per org: 'ECW' for the
-- org that typed it, otherwise 'ECWID-RS' / 'ECWID').
--
-- Verify:
--   SELECT organization_id, label FROM platforms WHERE slug = 'ecwid';
--   SELECT organization_id, label FROM platform_accounts WHERE slug = 'ecwid-main';

UPDATE platforms
   SET label = 'Ecwid'
 WHERE slug = 'ecwid'
   AND label IN ('ECW', 'ECWID', 'ECWID-RS');

UPDATE platform_accounts
   SET label = 'Ecwid'
 WHERE slug = 'ecwid-main'
   AND label IN ('ECW', 'ECWID', 'ECWID-RS');
