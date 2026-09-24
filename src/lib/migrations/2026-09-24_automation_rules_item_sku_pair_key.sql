-- ============================================================================
-- 2026-09-24_automation_rules_item_sku_pair_key.sql
--
-- Listing → staff rules are keyed on the (item number, SKU) PAIR, not the item
-- number alone (owner ruling 2026-09-24): one listing carrying two SKUs can
-- route its TEST (assigned_tech_id) and PACK (assigned_packer_id) work to
-- different staff.
--
-- Replaces ux_automation_rules_org_item_number (one active rule per org +
-- item #) with ux_automation_rules_org_item_number_sku on
--   (organization_id,
--    normalized item #  = upper(regexp_replace(trim(item_number), '[^A-Za-z0-9]', '', 'g')),
--    normalized SKU     = upper(btrim(sku)), '' when absent)
-- An item-#-only rule (no sku in when_json) keys as SKU '' — the listing-wide
-- wildcard — so there is still at most one wildcard per item #. Normalizations
-- mirror normalizeItemNumber / normalizeSku in src/lib/automations/listing-match.ts
-- and platform_listings.merchant_sku_normalized (UPPER(BTRIM(sku))).
--
-- SAFETY: the new key is strictly finer than the old one (it adds a column),
-- so every row that satisfied the old unique index satisfies the new one; the
-- CREATE cannot fail on existing data. New index is built before the old one
-- is dropped, inside one transaction, so there is no window without a key.
-- Writers (listing-assign-from-orders upsert, rules-crud) already stamp
-- organization_id; no tenancy change.
--
-- ROLLBACK (only valid while no item # carries two active rules):
--   CREATE UNIQUE INDEX IF NOT EXISTS ux_automation_rules_org_item_number
--     ON automation_rules (
--       organization_id,
--       upper(regexp_replace(trim(COALESCE(when_json->>'item_number', '')), '[^A-Za-z0-9]', '', 'g'))
--     )
--     WHERE deleted_at IS NULL
--       AND NULLIF(trim(COALESCE(when_json->>'item_number', '')), '') IS NOT NULL;
--   DROP INDEX IF EXISTS ux_automation_rules_org_item_number_sku;
--
-- VERIFY (after apply):
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'automation_rules' AND indexname LIKE 'ux_automation_rules_%';
--   -- expect ux_automation_rules_org_item_number_sku only
-- ============================================================================

BEGIN;

-- One active mapping per org + normalized item # + normalized SKU ('' = wildcard).
CREATE UNIQUE INDEX IF NOT EXISTS ux_automation_rules_org_item_number_sku
  ON automation_rules (
    organization_id,
    upper(regexp_replace(trim(COALESCE(when_json->>'item_number', '')), '[^A-Za-z0-9]', '', 'g')),
    upper(btrim(COALESCE(when_json->>'sku', '')))
  )
  WHERE deleted_at IS NULL
    AND NULLIF(trim(COALESCE(when_json->>'item_number', '')), '') IS NOT NULL;

DROP INDEX IF EXISTS ux_automation_rules_org_item_number;

COMMIT;
