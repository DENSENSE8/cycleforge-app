/**
 * Unbox-opened SQL predicates — safe for unit tests (no `server-only` pool).
 * Writers / ops-event stamps stay in {@link ./unbox-scan-opened}.
 */

/** Ops spine event — carton opened via a scan on the Unbox surface. */
export const UNBOX_SCAN_OPENED_EVENT = 'UNBOX_SCAN_OPENED';

/** SQL predicate: */
export const UNBOX_OPENED_PREDICATE_SQL = `(
  EXISTS (
    SELECT 1 FROM receiving_unbox ru_uo
    WHERE ru_uo.receiving_id = r.id
      AND ru_uo.organization_id = r.organization_id
      AND ru_uo.opened_at IS NOT NULL
  )
  OR EXISTS (
    SELECT 1 FROM ops_events oe_uo
    WHERE oe_uo.organization_id = r.organization_id
      AND oe_uo.entity_type = 'receiving'
      AND oe_uo.entity_id = r.id
      AND oe_uo.event_type = '${UNBOX_SCAN_OPENED_EVENT}'
  )
)`;

/** Column-only membership — reads ONLY the committed receiving_unbox.opened_at street column, dropping the derived ops_events OR-arm. */
const UNBOX_OPENED_PREDICATE_COLUMN_ONLY_SQL = `EXISTS (
  SELECT 1 FROM receiving_unbox ru_uo
  WHERE ru_uo.receiving_id = r.id
    AND ru_uo.organization_id = r.organization_id
    AND ru_uo.opened_at IS NOT NULL
)`;

/**
 * Pick the `view=unbox_opened` membership predicate. `columnOnly` (the flag on)
 * = the read-after-write-consistent column read; otherwise the legacy
 * OR-arm (column ∪ ops_events) for a backward-compatible, revertible rollout.
 */
export function unboxOpenedPredicateSql(columnOnly: boolean): string {
  return columnOnly ? UNBOX_OPENED_PREDICATE_COLUMN_ONLY_SQL : UNBOX_OPENED_PREDICATE_SQL;
}

