-- 2026-09-23_customers_shipstation_identity_search.sql
--
-- WHAT + WHY
--   The ShipStation connector now persists buyer identity: customers gain the
--   channel-stable `shipstation_customer_id` (mirroring the Zoho precedent
--   `zoho_contact_id`), with a per-org unique index so repeat buyers dedupe to
--   ONE row (enforced — the resolver's tier-1 match). Plus the search indexes
--   the operator workflow needs: trgm GIN on the canonical name expressions
--   ("call back, find by name" — plain ILIKE cannot scale) and functional
--   last-10-digit phone indexes so the voice matcher's
--   `right(regexp_replace(phone,'\D','','g'),10) = $1` predicate stops being a
--   per-call seq scan. The phone expressions here MUST stay byte-identical to
--   src/lib/orders/resolve-buyer-customers.ts (last10Sql) and
--   src/lib/voice/match-customer.ts — divergence silently degrades to scans.
--
-- SAFETY GATING
--   Additive only: one nullable column, five indexes, zero data changes.
--   `customers` already carries organization_id (NOT NULL) and RLS; existing
--   writers are untouched. pg_trgm is already installed (verified in-target).
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_customers_mobile_last10, idx_customers_phone_last10,
--     idx_customers_fullname_trgm, idx_customers_name_trgm, ux_customers_org_shipstation_id;
--   ALTER TABLE customers DROP COLUMN IF EXISTS shipstation_customer_id;
--
-- VERIFY
--   SELECT indexname FROM pg_indexes WHERE tablename='customers';
--   INSERT two same-org rows with the same shipstation_customer_id → second must fail.

-- Channel identity (Zoho-precedent shape: dedicated column, per-org unique).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipstation_customer_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_org_shipstation_id
  ON customers (organization_id, shipstation_customer_id)
  WHERE shipstation_customer_id IS NOT NULL;

-- Name search: trgm over the two canonical name expressions every matcher
-- already uses (customer_name/display_name first; first+last concat second).
-- NOTE: CONCAT_WS is STABLE in Postgres (it may invoke stable output
-- functions), so the first+last concat is the immutable COALESCE || form —
-- and the search predicate in customer-queries.ts uses this EXACT expression
-- or the planner won't match the index.
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin ((COALESCE(NULLIF(btrim(customer_name), ''), display_name, '')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_fullname_trgm
  ON customers USING gin ((NULLIF(btrim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '')) gin_trgm_ops);

-- Phone search / caller match: last 10 digits, NANP-normalized, org-leading.
CREATE INDEX IF NOT EXISTS idx_customers_phone_last10
  ON customers (organization_id, right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10))
  WHERE coalesce(phone, '') <> '';
CREATE INDEX IF NOT EXISTS idx_customers_mobile_last10
  ON customers (organization_id, right(regexp_replace(coalesce(mobile, ''), '\D', '', 'g'), 10))
  WHERE coalesce(mobile, '') <> '';
