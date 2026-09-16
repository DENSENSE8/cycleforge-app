-- ============================================================================
-- SKU IDENTITY — Zoho becomes the source of truth for a twinned catalog row
--
-- Operator 2026-09-15: "it all needs to be ported under one source of truth
-- which would be the ZOHOSKU … it must display the ZOHO SKU, title and more."
--
-- WHAT WAS WRONG
--   /api/sku-catalog/sync-ecwid-titles overwrote sku_catalog.product_title and
--   filled image_url for every SKU-string match, including rows whose SKU is a
--   ZOHO SKU. Measured on prod immediately before this migration:
--
--     sku_catalog rows with an exact active Zoho twin ......... 1118 / 1118
--     ... whose product_title disagreed with items.name .......  132
--     ... whose product_title == a sku_platform_ids listing ...  155
--     catalog image_url set while a Zoho twin exists .......... 132 / 139
--     provider_item_id missing but derivable from the twin .... 1002
--     provider_item_id CONFLICTING with the twin .............     0
--
--   Visible effects: PO 10-15153-01528 / rl.sku 00143 painted "1x Original
--   Bose UB-20 Wall Mount" instead of "Bose Solo Soundbar Series II"; catalog
--   00031 painted "Bose SoundDock 10 remote control" instead of "Bose Wave
--   Music System"; 00017 painted a CineMate remote instead of "Bose Wave Radio
--   II"; 00010 a 321 wall bracket instead of "Bose Wave Audio System Radio/CD".
--
-- WHY THIS IS A BACKFILL AND NOT A GUARD
--   The exact, org-scoped join sc.sku = rl.sku is TOTAL and UNAMBIGUOUS:
--   1118/1118 coverage, 0 Zoho SKUs with two item ids, 0 disagreements against
--   rz.zoho_item_id across 2862 receiving lines. The read-path
--   `similarity(sc.product_title, …) >= 0.25` predicate was a contamination
--   detector, not a key fix; it is deleted in this same change
--   (src/lib/receiving/lines/build-sql.ts, 3 sites + its parity fixture).
--   This migration removes the contamination the detector was hiding.
--
--   The Ecwid text is NOT destroyed: it already lives on the listing row,
--   sku_platform_ids.display_name / listing_title, which is where marketplace
--   copy belongs. 315 marketplace-only catalog rows (no Zoho twin) keep their
--   Ecwid titles and images — for those the marketplace name IS the identity.
--
-- TENANCY
--   Every statement matches on organization_id as well as sku. `items` and
--   `sku_catalog` both carry organization_id NOT NULL with the tenant_isolation
--   policy; no table is created, so no enforce_tenant_isolation() call is due.
--
-- IDEMPOTENT: re-running is a no-op — each UPDATE's predicate excludes rows it
--   already fixed, and the index drop is IF EXISTS.
--
-- ROLLBACK: the pre-image is recoverable from sku_platform_ids.display_name for
--   the 155 listing-sourced titles; there is no rollback for the index (see §4
--   for why its rule is false rather than mis-scoped).
-- ============================================================================

BEGIN;
-- ─── 1. provider_item_id ← the Zoho item id (identity, not display) ─────────
-- Fills NULLs only, so it can never repoint an existing link.
--
-- SKIPS any Zoho item id already claimed by another catalog row in the same
-- org: 8 rows carry a COLOUR-VARIANT MISPAIR that predates this work — e.g.
-- catalog `00031-WY` (Platinum White) points at Zoho `00031-CW` (Cream White);
-- likewise 00039-WY→00039, 00284-BK→00284-BK-N, 00364-BK→00364. Their titles
-- are already correct, so this is a LINK defect, not a display one, and which
-- colour is which is an operator decision — not something a backfill should
-- guess. Without this guard the whole migration aborts on
-- ux_sku_catalog_org_provider_item_id.
--
-- Audit the remainder with:
--   SELECT sc.id, sc.sku, sc.provider_item_id, i.sku AS points_at
--     FROM sku_catalog sc JOIN items i
--       ON i.zoho_item_id = sc.provider_item_id
--      AND i.organization_id = sc.organization_id AND i.status = 'active'
--    WHERE i.sku IS DISTINCT FROM sc.sku;
UPDATE sku_catalog sc
   SET provider_item_id = i.zoho_item_id,
       updated_at = NOW()
  FROM items i
 WHERE i.sku = sc.sku
   AND i.organization_id = sc.organization_id
   AND i.status = 'active'
   AND sc.provider_item_id IS NULL
   AND i.zoho_item_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM sku_catalog claimed
      WHERE claimed.organization_id = sc.organization_id
        AND claimed.provider_item_id = i.zoho_item_id
   );
-- ─── 2. product_title ← items.name for every Zoho-twinned row ──────────────
-- The 132 contaminated rows plus any future drift. NULLIF guards against a
-- blank Zoho name replacing a usable marketplace string.
UPDATE sku_catalog sc
   SET product_title = i.name,
       updated_at = NOW()
  FROM items i
 WHERE i.sku = sc.sku
   AND i.organization_id = sc.organization_id
   AND i.status = 'active'
   AND NULLIF(BTRIM(i.name), '') IS NOT NULL
   AND COALESCE(sc.product_title, '') IS DISTINCT FROM i.name;

-- ─── 3. image_url → NULL where a Zoho item photo exists ────────────────────
-- RECEIVING_LINE_IMAGE_URL_SQL already refuses sc.image_url when a Zoho item
-- row exists ("sku_catalog SKUs can collide with Ecwid and show the wrong
-- product"). Clearing the shadowed 132 makes every other reader agree with it
-- instead of each having to re-derive the rule.
UPDATE sku_catalog sc
   SET image_url = NULL,
       updated_at = NOW()
 WHERE COALESCE(sc.image_url, '') <> ''
   AND EXISTS (
     SELECT 1 FROM items i
      WHERE i.sku = sc.sku
        AND i.organization_id = sc.organization_id
        AND i.status = 'active'
   );

-- ─── 4. The tenant-blind UNIQUE (sku) — BLOCKED, deliberately not forced ────
-- `sku_catalog_sku_key UNIQUE (sku)` has the same defect as the indexes dropped
-- in 2026-07-29f_sku_platform_ids_tenant_contract: the rule is FALSE, not
-- mis-scoped. It asserts a SKU string is unique across every tenant, so tenant
-- B could never hold SKU 00143 at all. The real rule — one catalog row per
-- (org, sku) — is already enforced by sku_catalog_org_sku_key, which every
-- lookup in the app leads with.
--
-- It CANNOT be dropped here. Measured 2026-09-15:
--
--   ERROR: cannot drop constraint sku_catalog_sku_key ... because other
--          objects depend on it
--   DETAIL: constraint fk_bin_contents_sku on table bin_contents depends on
--           index sku_catalog_sku_key
--
--   fk_bin_contents_sku = FOREIGN KEY (sku) REFERENCES sku_catalog(sku)
--                         ON UPDATE CASCADE ON DELETE RESTRICT
--
-- So a second table keys inventory on the SKU STRING, and its FK is what keeps
-- the tenant-blind index alive. `DROP ... CASCADE` would silently delete that
-- FK and leave bin_contents referentially unprotected — not acceptable in a
-- migration whose point is identity integrity.
--
-- FOLLOW-UP (its own gated increment, 7 rows in bin_contents today): repoint
-- fk_bin_contents_sku at sku_catalog(id) — or at (organization_id, sku) against
-- sku_catalog_org_sku_key — then drop sku_catalog_sku_key. Until then the
-- `Sku identity` gate covers the read paths and this constraint is a known,
-- documented tenancy ceiling rather than a silent one.

COMMIT;
