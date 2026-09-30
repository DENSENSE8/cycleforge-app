-- migrate:no-transaction
-- 2026-09-29g_scan_match_prefix_indexes.sql
--
-- WHAT
--   text_pattern_ops indexes on the digits-only tracking keys the scan probe's
--   digit-prefix near-miss tiers compare (src/lib/receiving/scan-match-probe.ts,
--   `nearMissDigits`):
--     shipping_tracking_numbers  digits of COALESCE(normalized, raw)
--     zoho_po_mirror             digits of reference_number
--
-- WHY
--   A brand-new tracking misses every exact tier, so both near-miss tiers run
--   on the Unbox door's hottest path. They were the last two sequential regex
--   scans (~45 ms of a ~50 ms probe). The probe spells the predicate as
--   equalities + fixed-length prefix LIKEs, which these indexes serve.
--   Follows 2026-09-29f_scan_match_indexes.sql (already applied, immutable).
--
-- SAFETY
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS — no write lock, idempotent, no
--   data touched. STN is deliberately global (no organization_id).
--
-- ROLLBACK
--   DROP INDEX CONCURRENTLY IF EXISTS idx_stn_digits_pattern, idx_zoho_po_mirror_ref_digits_pattern;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stn_digits_pattern
  ON shipping_tracking_numbers ((regexp_replace(COALESCE(tracking_number_normalized, tracking_number_raw, ''), '[^0-9]', '', 'g')) text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_zoho_po_mirror_ref_digits_pattern
  ON zoho_po_mirror ((regexp_replace(COALESCE(reference_number, ''), '[^0-9]', '', 'g')) text_pattern_ops);
