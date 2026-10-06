-- ============================================================================
-- 2026-10-05_sku_paperwork_not_required.sql
--
-- WHAT: `sku_catalog.paperwork_not_required` — "this SKU never ships with
--       product paperwork" (operator ruling 2026-10-05, Labels & docs › Orders).
--
-- WHY:  `orders.docs_not_required` exempts ONE order; a SKU that never has a
--       manual (cables, parts, …) otherwise reads Missing on every order of it,
--       forever. With this flag set, a line on that SKU is `not_required`
--       (never `missing`) in the Orders view and satisfies release gate G2
--       (`G2_SKU_PAPERWORK_NOT_REQUIRED_SQL`, src/lib/orders/g2-paperwork-sql.ts).
--       Writer: PATCH /api/sku-catalog/[id]/paperwork-required.
--
-- SAFETY GATING:
--       Additive, idempotent. NOT NULL DEFAULT FALSE is a metadata-only change
--       on PG 11+ (no table rewrite), and FALSE is today's behaviour for every
--       SKU, so no gate or queue changes until an operator sets the flag.
--       sku_catalog is already tenant-scoped (organization_id + RLS); a column
--       inherits the table's policy — no tenancy change.
--       DEPLOY ORDER: apply BEFORE shipping the code that reads the column
--       (cage, Exceptions, print packet, queue-counts, Orders view all select it).
--
-- ROLLBACK:
--       ALTER TABLE sku_catalog DROP COLUMN IF EXISTS paperwork_not_required;
--       (and revert the readers above first).
--
-- VERIFY:
--       SELECT column_name, data_type, is_nullable, column_default
--         FROM information_schema.columns
--        WHERE table_name = 'sku_catalog' AND column_name = 'paperwork_not_required';
--       -- boolean | NO | false
-- ============================================================================

ALTER TABLE sku_catalog
  ADD COLUMN IF NOT EXISTS paperwork_not_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN sku_catalog.paperwork_not_required IS
  'SKU never ships with product paperwork: its order lines satisfy G2 and read Not required (2026-10-05).';
