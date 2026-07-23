-- ─────────────────────────────────────────────────────────────────────────────
-- sku_catalog.provider_item_id — hard inventory-provider linkage (Products Catalog).
-- ─────────────────────────────────────────────────────────────────────────────
-- Why: Catalog MDM is hub-primary (`sku_catalog`). The inventory connector mirror
-- (`items.zoho_item_id` today) must hang off the hub via a stable external id —
-- NEVER by SKU string (items and sku_catalog are independent numbering schemes).
-- Soft/sync-only joins drift; platform_ids are channel crosswalks, not inventory.
--
-- Safety: ADDITIVE + nullable. Existing rows stay NULL until sync writers stamp
-- provider_item_id or the guarded backfill below finds an unambiguous known link
-- via serial_units (sku_catalog_id + zoho_item_id), not SKU string equality.
--
-- Tenant: sku_catalog already has organization_id + per-org unique sku; the new
-- unique index is org-scoped and partial (NULLs allowed for unlinked hub rows).
--
-- Rollback:
--   DROP INDEX IF EXISTS ux_sku_catalog_org_provider_item_id;
--   ALTER TABLE sku_catalog DROP COLUMN IF EXISTS provider_item_id;
--
-- Verify:
--   SELECT COUNT(*) FILTER (WHERE provider_item_id IS NOT NULL) FROM sku_catalog;

ALTER TABLE sku_catalog
  ADD COLUMN IF NOT EXISTS provider_item_id text;

COMMENT ON COLUMN sku_catalog.provider_item_id IS
  'External inventory-provider item id (Zoho items.zoho_item_id while Zoho is the adapter). Join items on provider_item_id = zoho_item_id — never on SKU string. NULL = unlinked hub row.';

-- Safe backfill from known unit links only:
--   1) one distinct zoho_item_id per sku_catalog_id
--   2) that id exists on the tenant's items mirror
--   3) that id is claimed by at most one catalog row (pick lowest catalog id)
-- Unique index is created AFTER backfill so partial conflicts never abort DDL.
WITH candidates AS (
  SELECT
    su.sku_catalog_id,
    su.organization_id,
    MIN(su.zoho_item_id) AS zoho_item_id
  FROM serial_units su
  WHERE su.sku_catalog_id IS NOT NULL
    AND su.zoho_item_id IS NOT NULL
    AND BTRIM(su.zoho_item_id) <> ''
  GROUP BY su.sku_catalog_id, su.organization_id
  HAVING COUNT(DISTINCT su.zoho_item_id) = 1
),
validated AS (
  SELECT c.*
  FROM candidates c
  WHERE EXISTS (
    SELECT 1
    FROM items i
    WHERE i.zoho_item_id = c.zoho_item_id
      AND i.organization_id = c.organization_id
  )
),
winners AS (
  -- If multiple catalog rows share the same (org, zoho_item_id), keep one.
  SELECT DISTINCT ON (organization_id, zoho_item_id)
    sku_catalog_id,
    organization_id,
    zoho_item_id
  FROM validated
  ORDER BY organization_id, zoho_item_id, sku_catalog_id ASC
)
UPDATE sku_catalog sc
SET
  provider_item_id = w.zoho_item_id,
  updated_at = NOW()
FROM winners w
WHERE sc.id = w.sku_catalog_id
  AND sc.organization_id = w.organization_id
  AND sc.provider_item_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_sku_catalog_org_provider_item_id
  ON sku_catalog (organization_id, provider_item_id)
  WHERE provider_item_id IS NOT NULL;
