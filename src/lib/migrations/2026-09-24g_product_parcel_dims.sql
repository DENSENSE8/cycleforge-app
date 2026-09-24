-- 2026-09-24g_product_parcel_dims.sql
-- product_parcel_dims — the parcel (weight oz + L×W×H in) REMEMBERED per SKU
-- and per item number, so the next order of the same product arrives with its
-- box already measured.
--
-- Why: the parcel lived only on the ORDER (orders.parcel_*, migration
-- 2026-08-30d). Every order of the same item was weighed again, and no table
-- held a product-level weight or dimension (sku_catalog, sku_platform_ids,
-- items and packages have none — scouted on the live DB 2026-09-24).
--
--   write  setOrderParcel (src/lib/orders/caged-orders.ts) upserts the order's
--          SKU row AND its item-number row in the same tenant transaction —
--          only the values the operator entered; a cleared field never erases
--          what the product remembers.
--   read   GATE_SELECT + POST /api/shipping/order-rates fall back
--          order → SKU → item number when the order's own parcel is empty
--          (src/lib/orders/parcel-dims.ts), and report which one answered.
--
-- key_value is normalized by the writer AND the SQL readers the same way:
--   sku          UPPER(TRIM(sku))
--   item_number  normalizeIdentifier: upper, strip non-alphanumerics, strip
--                leading zeros (src/lib/product-manuals.ts)
--
-- Tenant-scoped from birth: organization_id NOT NULL, enforced via
-- enforce_tenant_isolation(). Safe because the only writer runs inside
-- withTenantTransaction (sets app.current_org) AND stamps organization_id.
--
-- ROLLBACK: select relax_tenant_isolation('product_parcel_dims');
--           DROP TABLE IF EXISTS product_parcel_dims;

CREATE TABLE IF NOT EXISTS product_parcel_dims (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,            -- no DEFAULT here; helper installs the loud-fail GUC default
  key_kind         TEXT NOT NULL,
  key_value        TEXT NOT NULL,
  sku_catalog_id   INTEGER REFERENCES sku_catalog(id) ON DELETE SET NULL,
  weight_oz        NUMERIC,
  length_in        NUMERIC,
  width_in         NUMERIC,
  height_in        NUMERIC,
  source_order_id  INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  updated_by       INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_parcel_dims_key_kind_check
    CHECK (key_kind IN ('sku', 'item_number')),
  CONSTRAINT product_parcel_dims_key_value_check
    CHECK (length(key_value) > 0),
  CONSTRAINT product_parcel_dims_positive_check
    CHECK (
      (weight_oz IS NULL OR weight_oz > 0)
      AND (length_in IS NULL OR length_in > 0)
      AND (width_in IS NULL OR width_in > 0)
      AND (height_in IS NULL OR height_in > 0)
    ),
  -- Per-org natural key — ALWAYS lead with organization_id.
  CONSTRAINT product_parcel_dims_org_key_unique
    UNIQUE (organization_id, key_kind, key_value)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('product_parcel_dims');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — product_parcel_dims left without FORCE RLS';
  END IF;
END $$;
