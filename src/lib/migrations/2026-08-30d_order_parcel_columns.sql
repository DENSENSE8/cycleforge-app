-- ============================================================================
-- 2026-08-30d_order_parcel_columns.sql
--
-- PARCEL ON THE ORDER for Order Intake & Acknowledgment.
-- Plan: docs/todo/order-intake-acknowledgment-PLAN.md §5.2.
--
-- WHAT. The triage form captures the physical parcel (weight + optional
-- L×W×H) so the ShipStation rate-shop can quote real dim-weight prices from
-- the To-ship desk. `sku_catalog` has no weight/dimension columns, so the
-- parcel lives on the ORDER — the one record the operator is already filling
-- and the one `/api/shipping/order-rates` already loads.
--
--   parcel_weight_oz   numeric  — parcel weight in ounces
--   parcel_length_in   numeric  — length, inches
--   parcel_width_in    numeric  — width, inches
--   parcel_height_in   numeric  — height, inches
--
-- All nullable, no defaults, no backfill: NULL means "operator has not weighed
-- or measured it yet", which is every existing row. A rate-shop with no stored
-- parcel falls back to the request body / ShipStation-stored weight exactly as
-- it does today.
--
-- SAFETY. Purely additive nullable columns on an existing table; no reader
-- selects them until the code that follows this migration lands, so applying
-- it ahead of the code changes zero behaviour (expand → code → contract,
-- AGENTS.md). No index: these columns are only ever read by primary-key order
-- lookups, never filtered on.
--
-- TENANCY. `orders` is already tenant-owned (organization_id NOT NULL, RLS
-- enforced). Adding nullable columns changes no key, index or policy — no
-- enforce_tenant_isolation() call belongs here.
--
-- ROLLBACK.
--   ALTER TABLE orders DROP COLUMN IF EXISTS parcel_weight_oz;
--   ALTER TABLE orders DROP COLUMN IF EXISTS parcel_length_in;
--   ALTER TABLE orders DROP COLUMN IF EXISTS parcel_width_in;
--   ALTER TABLE orders DROP COLUMN IF EXISTS parcel_height_in;
--
-- VERIFY.
--   SELECT parcel_weight_oz, parcel_length_in, parcel_width_in,
--          parcel_height_in
--     FROM orders LIMIT 1;   -- resolves; all NULL on existing rows
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_weight_oz numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_length_in numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_width_in  numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parcel_height_in numeric;
