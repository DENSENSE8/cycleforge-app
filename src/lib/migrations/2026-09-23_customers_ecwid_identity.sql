-- 2026-09-23_customers_ecwid_identity.sql
--
-- WHAT + WHY
--   Ecwid's `order.customerId` is a stable provider id and was being discarded
--   at the mapper (src/lib/orders/sources/ecwid-orders.ts). A provider id is a
--   tier-1 match key: it beats both email and phone, because a buyer who
--   changes either still resolves to the same storefront account. This adds the
--   column in the SAME shape as the Zoho and ShipStation precedents — dedicated
--   nullable text column, per-org partial unique index — rather than hiding it
--   in `channel_refs`, because `resolveBuyerCustomers` interpolates the column
--   NAME into SQL (CHANNEL_IDENTITY_COLUMNS); a JSONB key would require
--   resolver surgery for no gain.
--
--   Pairs with `CHANNEL_IDENTITY_COLUMNS.ecwid` in
--   src/lib/orders/resolve-buyer-customers.ts. Land this BEFORE the mapper
--   starts emitting `buyer`, or the first full-history sync keys 494 Ecwid
--   orders by email and a later pass has to re-key them.
--
-- SAFETY GATING
--   Additive only: one nullable column, one partial unique index, zero data
--   changes. `customers` already carries organization_id (NOT NULL) and RLS.
--   Existing writers are untouched — the column is NULL for every current row,
--   and the index is partial so NULLs never collide.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS ux_customers_org_ecwid_id;
--   ALTER TABLE customers DROP COLUMN IF EXISTS ecwid_customer_id;
--
-- VERIFY
--   SELECT indexname FROM pg_indexes WHERE tablename='customers'
--     AND indexname='ux_customers_org_ecwid_id';
--   INSERT two same-org rows with the same ecwid_customer_id → second must fail.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS ecwid_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_org_ecwid_id
  ON customers (organization_id, ecwid_customer_id)
  WHERE ecwid_customer_id IS NOT NULL;
