-- ============================================================================
-- 2026-07-29f_sku_platform_ids_tenant_expand.sql
--
-- sku_platform_ids: add the ORG-LED listing-identity unique — EXPAND phase.
--
-- Mirrors the expand/contract pair used for square_transactions
-- (2026-07-29a_square_transactions_tenant_contract.sql + its .gated half).
-- This half is additive and safe to apply on its own; the contract half
-- (2026-07-29f_sku_platform_ids_tenant_contract.sql.gated) drops the two legacy
-- global indexes and must NOT be applied until this ships everywhere.
--
-- WHY ─────────────────────────────────────────────────────────────────────────
-- The table gained organization_id in 2026-05-23_org_id_on_business_tables.sql
-- and FORCE RLS in 2026-06-22d_enforce_tenant_isolation_sku_platform_ids.sql,
-- but its two UNIQUE indexes were never re-cut and are still TENANT-BLIND:
--
--   ux_sku_platform_ids_platform_item  (platform, platform_item_id, acct)
--   ux_sku_platform_ids_platform_sku   (platform, platform_sku,     acct)
--
-- Two distinct defects follow.
--
-- 1. CROSS-TENANT (both indexes). Writers pre-check org-scoped
--    (`WHERE organization_id = $1`) and then insert. Tenant B's row collides
--    with a tenant-A row that RLS makes INVISIBLE to it, so the insert throws a
--    unique violation on a row that "does not exist" — the exact failure the
--    square_transactions header documents. Latent today (1 org) and guaranteed
--    on the first external tenant.
--
-- 2. ux_sku_platform_ids_platform_sku ENCODES A FALSE BUSINESS RULE, and this
--    one is live NOW. It asserts a SKU appears in at most ONE listing per
--    platform+account. A reseller multi-lists one product by design — today
--    sku_catalog_id 327 already has 7 platform listings. 1,654 rows still carry
--    a NULL platform_sku (712 ebay/USAV, 634 ebay/MK, 285 ebay/Dragonh) and the
--    index's `WHERE platform_sku IS NOT NULL` predicate exempts them only while
--    they stay NULL. The Google Sheets importer fills that column in as it
--    walks listings, so the second listing carrying a given SKU aborts the
--    import with a unique violation.
--
-- WHAT THIS MIGRATION DOES
--   Adds the org-led identity unique. A listing's identity is
--   (org, platform, account, platform_item_id) — NOT its SKU. Safe to add: the
--   legacy global index is strictly STRONGER, so any row set satisfying it
--   already satisfies this one. No SKU-keyed twin is created, because
--   uniqueness on platform_sku is the wrong rule, not the wrongly-scoped one.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS ux_sku_platform_ids_org_platform_item;
--
-- VERIFY (after apply): npm run tenancy:coverage
-- ============================================================================

BEGIN;

-- Org-led listing identity. Partial on platform_item_id IS NOT NULL to mirror
-- the legacy index it will replace (rows with no item id carry no identity).
CREATE UNIQUE INDEX IF NOT EXISTS ux_sku_platform_ids_org_platform_item
  ON sku_platform_ids (organization_id, platform, platform_item_id, COALESCE(account_name, ''))
  WHERE platform_item_id IS NOT NULL;

-- Org-led lookup path for SKU resolution. NOT unique — this is the index that
-- keeps /api/sku-catalog/resolve fast once the unique SKU index is dropped in
-- the contract half. (The pre-existing idx_sku_platform_ids_lookup_sku stays as
-- the org-agnostic fallback used by the unscoped best-effort resolve arm.)
CREATE INDEX IF NOT EXISTS idx_sku_platform_ids_org_lookup_sku
  ON sku_platform_ids (organization_id, platform, platform_sku)
  WHERE platform_sku IS NOT NULL;

COMMIT;
