-- serial_units.current_location lookup index.
--
-- WHAT / WHY
--   `getStockByLocation` (/m/stock and the desk stock ledger) anti-joins every
--   active location against serial_units on
--     su.organization_id = l.organization_id
--     AND su.current_location IN (l.barcode, l.name, l.display_name)
--   and groups unit placements by the same column. current_location had no
--   index, so the anti-join seq-scanned serial_units once per location:
--   EXPLAIN ANALYZE 241.8 ms of the page's database time (613 locations ×
--   2,204 units, 2026-10-03).
--
-- SAFETY
--   Additive index only; serial_units is ~2k rows, so a plain (transactional)
--   CREATE INDEX holds its lock for milliseconds. Idempotent.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS idx_serial_units_org_current_location;
--
-- VERIFY
--   EXPLAIN the empty_locations NOT EXISTS probe: an Index Scan on
--   idx_serial_units_org_current_location replaces the Seq Scan on serial_units.

CREATE INDEX IF NOT EXISTS idx_serial_units_org_current_location
  ON serial_units (organization_id, current_location)
  WHERE current_location IS NOT NULL;
