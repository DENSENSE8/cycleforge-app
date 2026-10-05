-- migrate:no-transaction
-- 2026-10-04_locate_bulk_keys.sql
--
-- WHAT
--   Expression indexes for the candidate keys of the bulk paste-a-list locate
--   (GET|POST /api/nav/locate, src/lib/nav/locate):
--     orders                     (organization_id, last 4 alphanumerics of order_id)
--     orders                     (organization_id, last 8 digits of order_id)
--     orders                     (organization_id, last 4 alphanumerics of item_number)
--     orders                     (organization_id, last 8 digits of item_number)
--     shipping_tracking_numbers  last 18 alphanumerics of tracking_number_normalized
--     shipping_tracking_numbers  lower(tracking_number_raw)
--     zoho_po_mirror             (organization_id, last 8 of the canonical Reference#)
--   Each expression is copied character-for-character from the statement
--   that probes it (outbound.ts ORDER_KEY_SQL / ORDER_DIGITS8_SQL /
--   STN_KEY18_SQL and its raw arm; check-zoho-received.ts lookupMirrorByTrackings
--   suffix arm) so the planner can match it.
--
-- WHY
--   A pasted list (up to CHECK_ZOHO_RECEIVED_MAX_INPUTS refs) is answered in
--   one set-based statement per locator arm. Without these the outbound arm
--   regex-normalizes every order of the org four times and every tracking
--   row twice per request (seq scans: ~60 ms at 5k orders / 12.7k tracking
--   rows on 2026-10-04, linear in table size); with them each ref is a
--   handful of index probes, flat in table size. The STN last-8 and
--   canonical arms already have indexes (idx_stn_norm_last8, the unique
--   tracking_number_normalized key).
--
-- SAFETY
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS — no write lock, idempotent, no
--   data touched. orders and zoho_po_mirror lead with organization_id (every
--   probe carries the org predicate); shipping_tracking_numbers is
--   deliberately global (no organization_id) — orders join it by id under
--   their own org predicate.
--
-- ROLLBACK
--   DROP INDEX CONCURRENTLY IF EXISTS idx_orders_org_order_key4,
--     idx_orders_org_order_digits8, idx_orders_org_item_key4,
--     idx_orders_org_item_digits8, idx_stn_norm_key18, idx_stn_raw_lower,
--     idx_zoho_po_mirror_org_ref_last8;
--
-- VERIFY
--   EXPLAIN (ANALYZE) the outbound refs statement (buildOutboundRefsSql) for
--   a 200-ref paste: no Seq Scan on orders or shipping_tracking_numbers in
--   order_candidate / tracking_candidate.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_org_order_key4
  ON orders (organization_id, (right(regexp_replace(lower(COALESCE(order_id, '')), '[^a-z0-9]', '', 'g'), 4)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_org_order_digits8
  ON orders (organization_id, (right(regexp_replace(COALESCE(order_id, ''), '[^0-9]', '', 'g'), 8)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_org_item_key4
  ON orders (organization_id, (right(regexp_replace(lower(COALESCE(item_number, '')), '[^a-z0-9]', '', 'g'), 4)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_org_item_digits8
  ON orders (organization_id, (right(regexp_replace(COALESCE(item_number, ''), '[^0-9]', '', 'g'), 8)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stn_norm_key18
  ON shipping_tracking_numbers ((right(regexp_replace(upper(COALESCE(tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 18)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stn_raw_lower
  ON shipping_tracking_numbers ((lower(tracking_number_raw)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_zoho_po_mirror_org_ref_last8
  ON zoho_po_mirror (organization_id, (right(NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), ''), 8)));
