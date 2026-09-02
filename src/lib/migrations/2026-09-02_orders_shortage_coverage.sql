-- ============================================================================
-- 2026-09-02 — orders.shortage_coverage (backorder coverage jsonb)
--
-- WHAT
--   One jsonb bag per order for Shortage coverage facts: PO pin, inbound
--   tracking (never outbound labels.tracking), and ETA. The display face is
--   always formatShortageCoverage in app code — this column is the store.
--
-- WHY JSONB AND NOT THREE COLUMNS
--   Coverage is optional and travels together. Staging and live paint one
--   string; splitting into columns would invite a cell that concatenates a
--   different face.
--
-- SAFETY
--   ADD COLUMN IF NOT EXISTS, nullable, no backfill. Existing rows read as
--   Uncovered. Writers stamp organization_id via existing orders UPDATE paths.
--
-- ROLLBACK
--   ALTER TABLE orders DROP COLUMN IF EXISTS shortage_coverage;
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shortage_coverage jsonb;
