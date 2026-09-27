-- 2026-09-27d_stn_tracking_raw_key18_index.sql
--
-- WHAT
--   CREATE INDEX idx_stn_tracking_raw_key18
--     ON shipping_tracking_numbers (RIGHT(regexp_replace(UPPER(tracking_number_raw), '[^A-Z0-9]', '', 'g'), 18))
--     WHERE tracking_number_raw <> '';
--
-- WHY
--   Every packer-log read resolves a scan's order with sqlPackerOrderMatchLateral
--   (src/lib/neon/packer-order-match.ts); its third arm matches an order whose
--   tracking ends in the same 18 alphanumerics (USPS 420<zip> prefix). That
--   expression had no index on shipping_tracking_numbers, so the old OR-form
--   lateral scanned every order × tracking row per scan:
--   GET /api/packerlogs?testedBy=1 (no week window) = "Query read timeout" after
--   93 s at 43.7k station_activity_logs rows (2026-09-27). The expression
--   matches the query text exactly (and the station_activity_logs twin
--   idx_station_activity_logs_scan_ref_key18), so the planner can use it.
--   tracking_number_normalized cannot stand in: it differs from this key on
--   152 of 12,010 rows.
--
-- SAFETY
--   Plain CREATE INDEX inside the runner's transaction (no CONCURRENTLY);
--   ~12k rows / 27 MB table, brief lock. Every function is IMMUTABLE. No code
--   depends on the index for correctness.
--
-- VERIFY
--   EXPLAIN the third arm for one sal row: expect an Index Scan using
--   idx_stn_tracking_raw_key18.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_stn_tracking_raw_key18;

CREATE INDEX IF NOT EXISTS idx_stn_tracking_raw_key18
  ON shipping_tracking_numbers (RIGHT(regexp_replace(UPPER(tracking_number_raw), '[^A-Z0-9]', '', 'g'), 18))
  WHERE tracking_number_raw <> '';
