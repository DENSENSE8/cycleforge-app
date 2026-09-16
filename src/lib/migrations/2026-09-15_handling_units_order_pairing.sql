-- ============================================================================
-- 2026-09-15: handling units — order pairing (tote ↔ order for pick → pack)
-- ============================================================================
-- Closes the picker→packer loop. `handling_units` already groups serial_units
-- (membership), and the scan dispatch table already routes a paired bin/tote
-- scan to the Pack Card (`bin-paired` row) — but NOTHING ever wrote the
-- order↔tote fact. This migration adds it as columns on the tote itself:
--
--   paired_order_id      the order whose picked units are (accruing) in this tote
--   paired_at / paired_by_staff_id   audit for who bound the tote, when
--
-- Model: ONE tote carries ONE order (a single `paired_order_id` column makes
-- that invariant structural — no unique index needed for it). One order MAY
-- span several totes; each tote scan still opens exactly one order, which is
-- what the pack Card consumes. Concurrency (two pickers, same tote, different
-- orders) is serialized by confirmPick's FOR UPDATE read + predicate UPDATE.
--
-- Status flow: pairing is stamped on each confirm-pick; completeSession flips
-- the tote OPEN → STAGED (only from OPEN), which is the state
-- `objectStateForHandlingUnitStatus` maps to `stagedForPack` — the existing
-- pack Card row fires with no dispatch-table change.
--
-- Safety gating: additive columns + one partial index on an enforced tenant
-- table (2026-06-22f). Every new writer runs inside withTenantTransaction and
-- predicates on organization_id, matching the loud-fail GUC contract.
--
-- Rollback:
--   ALTER TABLE handling_units
--     DROP COLUMN IF EXISTS paired_order_id,
--     DROP COLUMN IF EXISTS paired_at,
--     DROP COLUMN IF EXISTS paired_by_staff_id;
--   DROP INDEX IF EXISTS idx_handling_units_paired_order;
--   (column drops cascade the index)
--
-- Verify:
--   \d handling_units                       -- three new columns
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'handling_units';    -- idx_handling_units_paired_order
-- ============================================================================

BEGIN;

ALTER TABLE handling_units
  ADD COLUMN IF NOT EXISTS paired_order_id INTEGER
    REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paired_by_staff_id INTEGER REFERENCES staff(id);

COMMENT ON COLUMN handling_units.paired_order_id IS
  'The order whose picked units are accruing in this tote (pick→pack loop). One tote carries one order; stamped by confirm-pick, cleared at pack completion. NULL = unpaired.';
COMMENT ON COLUMN handling_units.paired_at IS
  'When the tote was first bound to paired_order_id for this run.';
COMMENT ON COLUMN handling_units.paired_by_staff_id IS
  'Staff who bound the tote to its order (the picker).';

-- Pack-side lookup: tote(s) staged for one order, per org (tenant law: the
-- org column leads). Partial — unpaired totes stay out of the index.
CREATE INDEX IF NOT EXISTS idx_handling_units_paired_order
  ON handling_units(organization_id, paired_order_id)
  WHERE paired_order_id IS NOT NULL;

COMMIT;
