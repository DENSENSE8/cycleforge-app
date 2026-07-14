-- Backfill receiving_unbox.opened_at from the UNBOX_SCAN_OPENED ops_events log.
--
-- Layer 1 of the Unbox-rail read-after-write fix. The rail's `view=unbox_opened`
-- membership currently ORs a committed street column (receiving_unbox.opened_at)
-- with a DERIVED ops_events EXISTS arm (see UNBOX_OPENED_PREDICATE_SQL). That
-- OR-arm — plus the lined/lineless carton split — lets a refetch fired mid-
-- `after()` (e.g. a PO match creating a receiving_line) transiently miss a carton
-- and blank the whole Unboxed rail until reload. The fix (behind the
-- RECEIVING_UNBOX_RAIL_COLUMN_READ flag) reads ONLY the committed column, so a
-- refetch right after any mutation reflects committed state.
--
-- This one-shot, idempotent backfill guarantees parity before the cutover: it
-- materializes opened_at for every carton that has an UNBOX_SCAN_OPENED event but
-- whose street column was never stamped (pre-street-writer history), so the
-- column-only read set-equals today's OR-arm read set.
--
-- receiving_unbox is already tenant-scoped (organization_id NOT NULL + GUC
-- default + tenant_isolation policy); this is a plain data backfill on an
-- existing table — no enforce_tenant_isolation(), no new index. Re-runnable:
-- ON CONFLICT COALESCE-once never overwrites a real stamp.

BEGIN;

INSERT INTO receiving_unbox (receiving_id, organization_id, opened_at)
SELECT
  oe.entity_id,
  oe.organization_id,
  MIN(oe.occurred_at) AS opened_at
FROM ops_events oe
JOIN receiving rc
  ON rc.id = oe.entity_id
 AND rc.organization_id = oe.organization_id
WHERE oe.entity_type = 'receiving'
  AND oe.event_type = 'UNBOX_SCAN_OPENED'
GROUP BY oe.entity_id, oe.organization_id
ON CONFLICT (receiving_id) DO UPDATE
  SET opened_at = COALESCE(receiving_unbox.opened_at, EXCLUDED.opened_at),
      updated_at = now();

COMMIT;
