-- 2026-09-30 — a dock scan-out exists only for a completed pack.
--
-- WHAT + WHY
--   `station_activity_logs.activity_type = 'SHIP_CONFIRM'` is the canonical
--   scanned-out fact. A carton that has no completed ORDERS `packer_logs` row
--   is not packed and therefore cannot have left through Scan out.
--
--   First remove historical violations. Their append-only audit rows remain:
--   audit evidence intentionally outlives reversible station activity rows.
--   Then install deferred constraint triggers on both sides of the relationship:
--   a SHIP_CONFIRM insert/update must have a completed pack, and removing the
--   final completed pack is refused unless the same transaction also removes
--   its SHIP_CONFIRM.
--
-- SAFETY GATING
--   Both tables are already tenant-owned. Every comparison includes
--   organization_id and shipment_id. The application scan-out writer now checks
--   the same predicate before writing, and reversePack removes SHIP_CONFIRM when
--   it removes the final completed ORDERS pack. Deferred checks permit that
--   multi-statement reversal to complete atomically.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_ship_confirm_requires_completed_pack ON station_activity_logs;
--   DROP TRIGGER IF EXISTS trg_completed_pack_retains_ship_confirm ON packer_logs;
--   DROP FUNCTION IF EXISTS fn_assert_ship_confirm_has_completed_pack();
--   Deleted invalid activity rows are recoverable only from audit evidence or a
--   database backup, and should be restored only after restoring their pack.
--
-- VERIFY
--   SELECT count(*)
--     FROM station_activity_logs sal
--    WHERE sal.activity_type = 'SHIP_CONFIRM'
--      AND NOT EXISTS (
--        SELECT 1 FROM packer_logs pl
--         WHERE pl.organization_id = sal.organization_id
--           AND pl.shipment_id = sal.shipment_id
--           AND pl.tracking_type = 'ORDERS'
--           AND pl.completion_state = 'COMPLETED'
--      );
--   -- expect: 0

DELETE FROM station_activity_logs sal
 WHERE sal.activity_type = 'SHIP_CONFIRM'
   AND NOT EXISTS (
     SELECT 1
       FROM packer_logs pl
      WHERE pl.organization_id = sal.organization_id
        AND pl.shipment_id = sal.shipment_id
        AND pl.tracking_type = 'ORDERS'
        AND pl.completion_state = 'COMPLETED'
   );

CREATE OR REPLACE FUNCTION fn_assert_ship_confirm_has_completed_pack()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  checked_organization_id UUID;
  checked_shipment_id BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'station_activity_logs' THEN
    IF NEW.activity_type <> 'SHIP_CONFIRM' THEN
      RETURN NEW;
    END IF;
    checked_organization_id := NEW.organization_id;
    checked_shipment_id := NEW.shipment_id;
  ELSE
    IF OLD.tracking_type <> 'ORDERS'
       OR OLD.completion_state <> 'COMPLETED'
       OR OLD.shipment_id IS NULL THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    checked_organization_id := OLD.organization_id;
    checked_shipment_id := OLD.shipment_id;
  END IF;

  IF checked_shipment_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM packer_logs pl
     WHERE pl.organization_id = checked_organization_id
       AND pl.shipment_id = checked_shipment_id
       AND pl.tracking_type = 'ORDERS'
       AND pl.completion_state = 'COMPLETED'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'SHIP_CONFIRM requires a completed ORDERS pack (organization_id=%s, shipment_id=%s)',
        checked_organization_id,
        COALESCE(checked_shipment_id::text, 'NULL')
      ),
      CONSTRAINT = 'ship_confirm_requires_completed_pack';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_ship_confirm_requires_completed_pack ON station_activity_logs;
CREATE CONSTRAINT TRIGGER trg_ship_confirm_requires_completed_pack
  AFTER INSERT OR UPDATE ON station_activity_logs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION fn_assert_ship_confirm_has_completed_pack();

DROP TRIGGER IF EXISTS trg_completed_pack_retains_ship_confirm ON packer_logs;
CREATE CONSTRAINT TRIGGER trg_completed_pack_retains_ship_confirm
  AFTER UPDATE OR DELETE ON packer_logs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION fn_assert_ship_confirm_has_completed_pack();
