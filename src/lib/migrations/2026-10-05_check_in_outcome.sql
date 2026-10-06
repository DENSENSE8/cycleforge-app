-- ============================================================================
-- order_support_follow_ups.outcome — how a resolved check-in ended
-- ============================================================================
-- WHAT + WHY (operator 2026-10-05, post-ship journey): the Fulfilled journey
-- ends on "were they happy, or did they have an issue". Closing a check-in as
-- `resolved` now REQUIRES the staffer to pick one; the projection keeps it
-- while the closure stands and clears it when the item reopens.
--   • outcome TEXT NULL — 'happy' | 'issue' (CHECK_IN_OUTCOMES in
--     src/lib/support/conversation/model.ts). NULL = not resolved, closed with
--     no response, resolved without the check-in close (generic resolve), or
--     resolved before this column existed.
--   • order_support_follow_ups_outcome_chk — the closed vocabulary.
--   • order_support_follow_ups_outcome_resolved_chk — an outcome only on a
--     `resolved` row; every other state carries NULL.
--
-- SAFETY GATING: additive nullable column, no backfill — every existing row is
-- NULL and satisfies both CHECKs. The only writer is
-- src/lib/support/check-ins/projection.ts (refresh + close), which writes the
-- outcome together with state = 'resolved' and NULL otherwise; the milestone
-- projector (milestones-db.ts) only touches unopened not_due/due/not_applicable
-- rows, whose outcome is always NULL. The table is already FORCE-enforced
-- (2026-10-04d); a new column needs no tenancy change.
--
-- ROLLBACK (inverse DDL; only after the readers are cut):
--   ALTER TABLE order_support_follow_ups DROP CONSTRAINT IF EXISTS order_support_follow_ups_outcome_resolved_chk;
--   ALTER TABLE order_support_follow_ups DROP CONSTRAINT IF EXISTS order_support_follow_ups_outcome_chk;
--   ALTER TABLE order_support_follow_ups DROP COLUMN IF EXISTS outcome;
--
-- VERIFY:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname IN ('order_support_follow_ups_outcome_chk','order_support_follow_ups_outcome_resolved_chk');
--   SELECT state, outcome, count(*) FROM order_support_follow_ups GROUP BY 1, 2;
-- ============================================================================

ALTER TABLE order_support_follow_ups ADD COLUMN IF NOT EXISTS outcome TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'order_support_follow_ups_outcome_chk'
       AND conrelid = 'order_support_follow_ups'::regclass
  ) THEN
    ALTER TABLE order_support_follow_ups ADD CONSTRAINT order_support_follow_ups_outcome_chk
      CHECK (outcome IS NULL OR outcome IN ('happy', 'issue'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'order_support_follow_ups_outcome_resolved_chk'
       AND conrelid = 'order_support_follow_ups'::regclass
  ) THEN
    ALTER TABLE order_support_follow_ups ADD CONSTRAINT order_support_follow_ups_outcome_resolved_chk
      CHECK (outcome IS NULL OR state = 'resolved');
  END IF;
END $$;

COMMENT ON COLUMN order_support_follow_ups.outcome IS
  'How a resolved check-in ended for the customer: happy | issue. Required when staff close the check-in as resolved; NULL for every other state and for resolves that did not go through the check-in close.';
