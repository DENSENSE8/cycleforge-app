-- 2026-09-24b_repair_actions_bench_detail.sql
-- Bench-log detail on repair_actions as real columns (was folded into
-- part_name / notes text):
--
--   session_id      → repair_bench_sessions(id): the bench timer this entry was
--                     logged in (NULL = logged with no timer running).
--   donor_source    → where an installed part came from: 'new_stock' |
--                     'donor_unit' | 'customer_part' (action_type 'replaced').
--   donor_ref       → the donor unit's serial / unit id, or the SKU reference,
--                     when donor_source says it came from another unit.
--   component_ref   → board reference designator worked on, e.g. 'C12', 'U3'
--                     (action_type 'repaired').
--   component_value → its value / part, e.g. '470µF 16V'.
--   component_qty   → how many of that component.
--   stock_ledger_id → sku_stock_ledger(id): the −1 delta written when the tech
--                     chose "take from stock" for a new-stock installed part
--                     (writeLedgerDelta, same transaction as the action insert).
--                     Deleting the action writes the reversing +1 delta; this
--                     link is how the reversal finds the original row.
--
-- Backward compatible: every column is nullable with no default, so existing
-- rows keep their meaning (old_sku/old_serial = removed / worked on,
-- new_sku/new_serial = installed / needed, part_name, duration_min, notes).
-- Rows logged before this migration may carry "title — component" in part_name;
-- readers keep rendering part_name as-is.
--
-- Ordering: 'b' because session_id references repair_bench_sessions, created in
-- 2026-09-24_repair_bench_sessions.sql.
--
-- Tenancy: repair_actions is already FORCE-RLS enforced (2026-06-22f); no new
-- table, nothing to enforce. The insert (src/lib/repair/repair-action-queries.ts
-- via POST /api/repair/actions) stamps organization_id explicitly.
--
-- ROLLBACK:
--   ALTER TABLE repair_actions
--     DROP COLUMN IF EXISTS session_id, DROP COLUMN IF EXISTS donor_source,
--     DROP COLUMN IF EXISTS donor_ref, DROP COLUMN IF EXISTS component_ref,
--     DROP COLUMN IF EXISTS component_value, DROP COLUMN IF EXISTS component_qty,
--     DROP COLUMN IF EXISTS stock_ledger_id;
--   (constraints and the index drop with their columns)

ALTER TABLE repair_actions
  ADD COLUMN IF NOT EXISTS session_id      BIGINT REFERENCES repair_bench_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS donor_source    TEXT,
  ADD COLUMN IF NOT EXISTS donor_ref       TEXT,
  ADD COLUMN IF NOT EXISTS component_ref   TEXT,
  ADD COLUMN IF NOT EXISTS component_value TEXT,
  ADD COLUMN IF NOT EXISTS component_qty   INTEGER,
  ADD COLUMN IF NOT EXISTS stock_ledger_id INTEGER REFERENCES sku_stock_ledger(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'repair_actions_donor_source_check'
       AND conrelid = 'repair_actions'::regclass
  ) THEN
    ALTER TABLE repair_actions
      ADD CONSTRAINT repair_actions_donor_source_check
      CHECK (donor_source IS NULL OR donor_source IN ('new_stock', 'donor_unit', 'customer_part'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'repair_actions_component_qty_check'
       AND conrelid = 'repair_actions'::regclass
  ) THEN
    ALTER TABLE repair_actions
      ADD CONSTRAINT repair_actions_component_qty_check
      CHECK (component_qty IS NULL OR component_qty > 0);
  END IF;
END $$;

-- "What was logged in this bench session" — the session summary read.
CREATE INDEX IF NOT EXISTS idx_repair_actions_session_id
  ON repair_actions (session_id)
  WHERE session_id IS NOT NULL AND deleted_at IS NULL;
