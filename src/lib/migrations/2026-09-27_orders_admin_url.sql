-- orders.admin_url — an operator-set link to the order's admin page (owner 2026-09-27).
--
-- What: the To-ship card and the order record print an open (↗) icon beside
-- every order number. Today that link is derived from the order-number shape +
-- platform (`marketplaceOrderUrl`), so manual orders (CF-ML-…) and unknown
-- storefronts get none. This column stores the link an operator pastes; when
-- set it wins over the derived URL.
--
-- Safety: additive, nullable, no default, no backfill — every existing reader
-- ignores it and every existing writer leaves it NULL. `orders` is already
-- tenant-scoped (organization_id + RLS); a column add changes nothing there.
--
-- Rollback: ALTER TABLE orders DROP COLUMN IF EXISTS admin_url;
--
-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'orders' AND column_name = 'admin_url';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_url TEXT;
