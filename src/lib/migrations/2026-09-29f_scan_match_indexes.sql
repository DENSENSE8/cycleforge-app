-- migrate:no-transaction
-- 2026-09-29f_scan_match_indexes.sql
--
-- WHAT
--   Expression indexes for every indexable tier of the one-trip scan probe
--   (src/lib/receiving/scan-match-probe.ts — SCAN_MATCH_PROBE_SQL):
--     shipping_tracking_numbers  last-8 digits of tracking_number_normalized
--     shipping_tracking_numbers  last-8 digits of tracking_number_raw
--     receiving_scans            last-8 digits of tracking_number
--     zoho_po_mirror             canonical Reference# (upper alphanumerics)
--     inbound_purchase_order_mirror (organization_id, canonical tracking)
--   Each expression is copied character-for-character from the probe so the
--   planner can match it.
--
-- WHY
--   Found / unfound at the Unbox door must be instant. These tiers were regex
--   sequential scans (STN last-8 walked 3.6k cartons per miss). The digit-
--   prefix near-miss tiers stay unindexed on purpose: the probe runs them only
--   when every outranking tier missed.
--
-- SAFETY
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS — no write lock, idempotent, no
--   data touched. STN is deliberately global (no organization_id); the other
--   tables are read under the org GUC with their own org predicates.
--
-- ROLLBACK
--   DROP INDEX CONCURRENTLY IF EXISTS idx_stn_norm_last8, idx_stn_raw_last8,
--     idx_receiving_scans_last8, idx_zoho_po_mirror_ref_canon,
--     idx_inbound_po_mirror_tracking_canon;
--
-- VERIFY
--   EXPLAIN the probe for a miss: no Seq Scan on shipping_tracking_numbers,
--   receiving_scans or zoho_po_mirror outside the digit-prefix CTEs.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stn_norm_last8
  ON shipping_tracking_numbers (RIGHT(regexp_replace(tracking_number_normalized, '\D', '', 'g'), 8));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stn_raw_last8
  ON shipping_tracking_numbers (RIGHT(regexp_replace(tracking_number_raw, '\D', '', 'g'), 8));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_receiving_scans_last8
  ON receiving_scans (RIGHT(regexp_replace(tracking_number, '\D', '', 'g'), 8));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_zoho_po_mirror_ref_canon
  ON zoho_po_mirror ((NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '')));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inbound_po_mirror_tracking_canon
  ON inbound_purchase_order_mirror (organization_id, (NULLIF(upper(regexp_replace(COALESCE(tracking_number, ''), '[^A-Za-z0-9]', '', 'g')), '')));
