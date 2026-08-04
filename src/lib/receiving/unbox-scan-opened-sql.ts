/**
 * Unbox-opened SQL predicates — safe for unit tests (no `server-only` pool).
 * Writers / ops-event stamps stay in {@link ./unbox-scan-opened}.
 */

/** Ops spine event — carton opened via a scan on the Unbox surface. */
export const UNBOX_SCAN_OPENED_EVENT = 'UNBOX_SCAN_OPENED';

/**
 * SQL predicate: carton was scanned/opened on the Unbox workspace.
 * Wave-2 reader cutover: the opened stamp now reads from the receiving_unbox
 * street table (ru.opened_at, 1:1 with the carton — spine unbox_opened_at is
 * writer-owned + trigger-mirrored), with ops_events as a secondary signal for
 * backfills. References only the outer alias `r`, so importers need no join.
 */
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

/**
 * Column-only membership — reads ONLY the committed receiving_unbox.opened_at
 * street column, dropping the derived ops_events OR-arm. Because opened_at is
 * written (committed) by the same request that opens/matches a carton, a refetch
 * fired right after a mutation can never transiently miss it — which the OR-arm
 * (a best-effort, separately-written log) and the lined/lineless split otherwise
 * allow, blanking the whole rail until reload. Selected via
 * `RECEIVING_UNBOX_RAIL_COLUMN_READ` once the backfill migration proves parity.
 */
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

