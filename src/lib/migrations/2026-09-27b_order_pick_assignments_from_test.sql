-- ============================================================================
-- 2026-09-27b_order_pick_assignments_from_test.sql
--
-- WHAT
--   Moves every ORDER-scoped TEST assignee onto a new ORDER-scoped PICK row,
--   then clears the assignee off the TEST row. The TEST row itself stays: it
--   is the order's deadline carrier (upsertOrderDeadline, WA_TEST_DEADLINE_*).
--
-- WHY
--   The only writers of an ORDER/TEST assignee were the "Picked by" control
--   (useOrdersQueueFeed handleCommitStageAssign('orders.picked') →
--   /api/orders/assign testerId) and the order desk (/test?ship=urgent, the
--   Picker). QC is a UNIT fact (testing_results on serial_units), never an
--   order assignment. So every order-level TEST assignee is a picker.
--   Measured 2026-09-27 (dev): ASSIGNED 342 (342 with assignee), DONE 724
--   (398), OPEN 3725 (6), CANCELED 227 (76, not moved).
--
-- SAFETY / GATING
--   Apply together with the code that reads/writes PICK (orders-list wa pick
--   lateral, /api/orders/assign pickerId). Idempotent: rows are copied only
--   when no backup row exists for the TEST row, and the clear only touches
--   TEST rows recorded in the backup table.
--   The unique active index ux_work_assignments_active_entity is per
--   work_type, so a PICK row never collides with its TEST sibling.
--
-- BACKUP TABLE (deliberately not tenant-enforced)
--   order_test_to_pick_backfill_2026_09_27 is a migration artifact with no
--   application reader; it exists only to make the rollback exact. It carries
--   organization_id for audit. Drop it once the owner signs the split off.
--
-- ROLLBACK
--   UPDATE work_assignments wa
--      SET assigned_tech_id = b.assigned_tech_id,
--          completed_by_tech_id = b.completed_by_tech_id,
--          status = b.status
--     FROM order_test_to_pick_backfill_2026_09_27 b
--    WHERE wa.id = b.test_wa_id;
--   DELETE FROM work_assignments wa
--    USING order_test_to_pick_backfill_2026_09_27 b
--    WHERE wa.id = b.pick_wa_id;
--   DROP TABLE order_test_to_pick_backfill_2026_09_27;
--
-- VERIFY
--   SELECT work_type, status, count(*), count(assigned_tech_id)
--     FROM work_assignments WHERE entity_type = 'ORDER'
--    GROUP BY 1, 2 ORDER BY 1, 2;
--   -- expect: TEST rows carry no assigned_tech_id except ones written after
--   --         the code cutover; PICK rows = the moved count.
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_test_to_pick_backfill_2026_09_27 (
  test_wa_id           INTEGER PRIMARY KEY,
  organization_id      UUID NOT NULL,
  order_id             BIGINT NOT NULL,
  assigned_tech_id     INTEGER NOT NULL,
  completed_by_tech_id INTEGER,
  status               assignment_status_enum NOT NULL,
  pick_wa_id           INTEGER
);

-- 1. Record every order-level TEST assignee not yet moved.
INSERT INTO order_test_to_pick_backfill_2026_09_27
  (test_wa_id, organization_id, order_id, assigned_tech_id, completed_by_tech_id, status)
SELECT wa.id, wa.organization_id, wa.entity_id, wa.assigned_tech_id, wa.completed_by_tech_id, wa.status
  FROM work_assignments wa
 WHERE wa.entity_type = 'ORDER'
   AND wa.work_type = 'TEST'
   AND wa.assigned_tech_id IS NOT NULL
   AND wa.status <> 'CANCELED'
ON CONFLICT (test_wa_id) DO NOTHING;

-- 2. One PICK row per recorded TEST row (same assignee, status, timestamps).
-- (Row by row so each PICK id maps to exactly its TEST row — an order may
-- hold a DONE and an ASSIGNED TEST row at once.)
DO $$
DECLARE
  r RECORD;
  new_id INTEGER;
BEGIN
  FOR r IN
    SELECT b.test_wa_id, t.entity_id, b.assigned_tech_id, b.completed_by_tech_id, b.status,
           t.priority, t.assigned_at, t.started_at, t.completed_at, t.created_at, t.updated_at,
           t.organization_id
      FROM order_test_to_pick_backfill_2026_09_27 b
      JOIN work_assignments t ON t.id = b.test_wa_id
     WHERE b.pick_wa_id IS NULL
  LOOP
    INSERT INTO work_assignments
      (entity_type, entity_id, work_type, assigned_tech_id, completed_by_tech_id,
       status, priority, assigned_at, started_at, completed_at, created_at, updated_at,
       organization_id)
    VALUES
      ('ORDER', r.entity_id, 'PICK', r.assigned_tech_id, r.completed_by_tech_id,
       r.status, r.priority, r.assigned_at, r.started_at, r.completed_at, r.created_at, r.updated_at,
       r.organization_id)
    -- An operator may already hold a live PICK row on this order (code ships
    -- first); keep theirs. new_id stays NULL, so step 3 leaves that TEST row.
    ON CONFLICT DO NOTHING
    RETURNING id INTO new_id;

    UPDATE order_test_to_pick_backfill_2026_09_27
       SET pick_wa_id = new_id
     WHERE test_wa_id = r.test_wa_id;
  END LOOP;
END $$;

-- 3. Clear the assignee off the TEST row; an unassigned active TEST row is OPEN.
UPDATE work_assignments wa
   SET assigned_tech_id = NULL,
       completed_by_tech_id = NULL,
       status = CASE WHEN wa.status IN ('ASSIGNED', 'IN_PROGRESS') THEN 'OPEN'::assignment_status_enum ELSE wa.status END
  FROM order_test_to_pick_backfill_2026_09_27 b
 WHERE wa.id = b.test_wa_id
   AND b.pick_wa_id IS NOT NULL
   AND wa.assigned_tech_id IS NOT DISTINCT FROM b.assigned_tech_id;
