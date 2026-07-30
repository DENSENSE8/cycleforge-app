-- ─────────────────────────────────────────────────────────────────────────────
-- sku_platform_ids: drop the two tenant-blind UNIQUE indexes — CONTRACT phase
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 of the expand/contract pair started in
-- 2026-07-29f_sku_platform_ids_tenant_expand.sql, which added
-- ux_sku_platform_ids_org_platform_item alongside the two legacy global indexes.
--
-- ⚠️ .gated — DO NOT APPLY UNTIL THE EXPAND HALF IS DEPLOYED EVERYWHERE.
-- Nothing in the app infers ON CONFLICT against either dropped index today
-- (order-catalog-link-chores.ts uses bare `ON CONFLICT DO NOTHING`, and the
-- other writers do the same), so this drop does not strand an ON CONFLICT
-- specification the way the square_transactions contract half would. It is
-- still sequenced behind the expand half so the org-led identity index exists
-- before the global one disappears.
--
-- ── INDEX 1: ux_sku_platform_ids_platform_item ──────────────────────────────
-- Superseded by ux_sku_platform_ids_org_platform_item. The legacy index says no
-- two TENANTS may list the same platform item id under the same account name.
-- That is wrong once a second tenant exists, and under FORCE RLS it fails
-- confusingly: the colliding row is invisible to the writer, so the insert
-- throws a unique violation on a row the session cannot see.
--
-- ── INDEX 2: ux_sku_platform_ids_platform_sku ───────────────────────────────
-- Dropped OUTRIGHT, with no org-led replacement, because the rule itself is
-- false — not merely mis-scoped. It asserts a SKU appears in at most one
-- listing per platform+account, while a reseller multi-lists one product across
-- many listings by design (sku_catalog_id 327 has 7 today). A listing's
-- identity is platform_item_id; platform_sku is a resolution HINT that the
-- pairing hub maps many-to-one onto sku_catalog_id.
--
-- Consequence to accept deliberately: after this, two rows may share
-- (platform, platform_sku, account_name). Every read path already tolerates
-- that — /api/sku-catalog/resolve is written as ordered best-effort arms with
-- LIMIT 1, and the pairing hub is many-listings-to-one-SKU by construction.
-- Lookups stay indexed by idx_sku_platform_ids_lookup_sku plus the org-led
-- idx_sku_platform_ids_org_lookup_sku added in the expand half.
--
-- PK is unaffected: sku_platform_ids.id is a SERIAL PK and every FK reference
-- points at it, never at platform_sku or platform_item_id.
--
-- ROLLBACK (recreates both legacy indexes; will FAIL if rows now legitimately
-- violate them — which is the point of the drop, so treat a failed rollback as
-- confirmation rather than an error):
--   CREATE UNIQUE INDEX ux_sku_platform_ids_platform_item
--     ON sku_platform_ids (platform, platform_item_id, COALESCE(account_name, ''))
--     WHERE platform_item_id IS NOT NULL;
--   CREATE UNIQUE INDEX ux_sku_platform_ids_platform_sku
--     ON sku_platform_ids (platform, platform_sku, COALESCE(account_name, ''))
--     WHERE platform_sku IS NOT NULL;
--
-- AFTER APPLY: the defensive sku-fill guard in
-- src/lib/inventory/order-catalog-link-chores.ts (the CASE/EXISTS block) becomes
-- dead weight and should be simplified back to COALESCE(platform_sku, $2).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP INDEX IF EXISTS ux_sku_platform_ids_platform_sku;
DROP INDEX IF EXISTS ux_sku_platform_ids_platform_item;

COMMIT;
