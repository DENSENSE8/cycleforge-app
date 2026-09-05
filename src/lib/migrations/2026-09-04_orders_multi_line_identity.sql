-- ============================================================================
-- 2026-09-04: orders line identity — one marketplace order, many lines
-- ============================================================================
-- WHAT
--
-- `orders` has always been a LINE table wearing an order's name: product_title,
-- sku, condition, quantity, item_number, sale_amount and sku_catalog_id are all
-- per-line facts, and `order_id` is the marketplace order number, meant to
-- repeat across the siblings that shipped together.
--
-- One index asserted otherwise:
--
--   CREATE UNIQUE INDEX idx_orders_unique_account_order ON orders (order_id, account_source)
--
-- That made a five-item order impossible to represent. `QueueGroupRow`'s
-- multi-line parent chrome (order chip + "N lines" + "N tracking" + tri-state
-- group checkbox) has therefore never painted on a live lane: the only rows that
-- share an order_id today are legacy pairs with a NULL account_source, which
-- Postgres exempts because NULLs are distinct in a unique btree.
--
-- This migration gives a line its own identity and re-keys uniqueness around it.
--
-- TWO BUGS FIXED IN PASSING
--
--   1. TENANCY. The old index omitted organization_id, so two orgs selling on the
--      same channel with the same order number collided globally. The new index
--      leads with organization_id, per the per-org-key rule that the serial_units
--      incident established.
--
--   2. A BROKEN UPSERT. `idx_orders_unique_account_order` is a bare unique INDEX,
--      never promoted to a CONSTRAINT, so the
--      `ON CONFLICT ON CONSTRAINT idx_orders_unique_account_order` form used by
--      the marketplace connectors throws at runtime:
--        constraint "idx_orders_unique_account_order" for table "orders" does not exist
--      The replacement is inferred by COLUMN LIST, which Postgres does accept for
--      a plain unique index. See the CODE PREREQUISITE below.
--
-- COLUMN SHAPE
--
-- `external_line_id` is the marketplace's own line identity — Amazon
-- OrderItemId, eBay lineItemId / transactionId, Shopify line_item.id. It is
-- NOT NULL DEFAULT '' rather than nullable on purpose: a NULL would be distinct
-- from every other NULL and the index would stop deduplicating entirely, which
-- is how an idempotent sync turns into a row multiplier. Empty string is the
-- honest value for a source that supplies no line id, and it preserves exactly
-- today's one-line-per-order behaviour for those sources.
--
-- SAFETY GATING
--
-- Verified against this database before writing:
--   * 0 rows violate the new index (collisions under
--     (organization_id, order_id, account_source, '') = 0)
--   * 0 rows have a NULL organization_id
-- The new key is strictly WEAKER than the old one on existing data — it adds two
-- columns to a unique tuple and can only ever split groups apart, never merge
-- them — so the CREATE cannot fail on data that satisfied the old index.
--
-- `orders` already carries organization_id NOT NULL and is covered by the
-- existing tenancy enforcement; this migration adds a column and re-keys an
-- index, so it does not call enforce_tenant_isolation() again.
--
-- CODE PREREQUISITE (apply together)
--
-- Dropping the old index removes the name the connectors reference. The callers
-- below must already be on the column-inference form when this runs:
--   src/lib/amazon/order-sync.ts
--   src/lib/ebay/sync.ts            (two upserts)
--   src/lib/orders/ingest-canonical-orders.ts
-- They were broken before this migration and are correct after it; there is no
-- window in which this migration makes them worse.
--
-- ROLLBACK
--
--   DROP INDEX IF EXISTS idx_orders_unique_org_account_order_line;
--   CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_account_order
--     ON orders (order_id, account_source);
--   -- keep the column; dropping it loses ingested line identities
--
-- Rolling back only succeeds while no order carries more than one line for a
-- non-null account_source. Once real multi-line orders land, the old index can
-- no longer be rebuilt — that is the point of the change.
--
-- VERIFY
--
--   select indexdef from pg_indexes where tablename = 'orders' and indexname like 'idx_orders_unique%';
--   select count(*) from orders where external_line_id <> '';
--
-- Additive + idempotent.
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS external_line_id text NOT NULL DEFAULT '';

COMMENT ON COLUMN orders.external_line_id IS
  'Marketplace line identity (Amazon OrderItemId, eBay lineItemId, Shopify line_item.id). '
  'Empty string when the source supplies none — never NULL, so the unique index keeps deduplicating.';

-- New key first, so the table is never without a uniqueness guard.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_org_account_order_line
  ON orders (organization_id, order_id, account_source, external_line_id);

DROP INDEX IF EXISTS idx_orders_unique_account_order;
