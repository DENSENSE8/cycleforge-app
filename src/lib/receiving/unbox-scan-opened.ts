import pool from '@/lib/db';
import { recordOpsEvent } from '@/lib/ops-events';
import { resolveSurfaceWorkflowNodeId } from '@/lib/stations/surface-workflow-node';
import { upsertReceivingUnbox } from '@/lib/receiving/streets/carton-street-write';

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
 * Carton first touched on Unbox with no prior triage door scan.
 * Street read: receiving_unbox.intake_path = 'unbox_only' (false when no row),
 * replacing the spine boolean r.unbox_only_intake.
 */
export const UNBOX_ONLY_INTAKE_PREDICATE_SQL = `EXISTS (
  SELECT 1 FROM receiving_unbox ru_ui
  WHERE ru_ui.receiving_id = r.id
    AND ru_ui.organization_id = r.organization_id
    AND ru_ui.intake_path = 'unbox_only'
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
export const UNBOX_OPENED_PREDICATE_COLUMN_ONLY_SQL = `EXISTS (
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

/** @deprecated Use UNBOX_OPENED_PREDICATE_SQL */
export const UNBOX_SCAN_OPENED_EXISTS_SQL = UNBOX_OPENED_PREDICATE_SQL;

/**
 * Record that this carton entered the operator's Unbox work queue via a scan.
 *
 * Unbox scans are independent from triage door stamps:
 *   1. Stamps receiving_unbox.opened_at/opened_by only (NOT the triage door
 *      stamp, NOT unboxed_at). Wave-3 writer inversion: written DIRECTLY on
 *      the receiving_unbox street table (the spine columns are dropped in
 *      Wave 4); COALESCE-once inside the helper so a re-scan never re-stamps.
 *   2. Derives intake_path in the same statement ('unbox_only' when the carton
 *      has no triage door stamp — the bench-first path; an already-resolved
 *      path is kept).
 *   3. Appends UNBOX_SCAN_OPENED ops_event for rails / timeline.
 *
 * The "Unboxed" workflow milestone (unboxed_at, line UNBOXED transition) is
 * owned by the operator's Unboxed/Receive action — not this scan.
 *
 * Returns `firstOpen: true` when this call transitioned `opened_at` from NULL —
 * i.e. the carton just LEFT triage membership. Callers that short-circuit
 * lookup-po (touch-scan) publish the cross-surface realtime signal on exactly
 * that transition, so other terminals' Arrival queues purge the carton instead
 * of showing phantom dock inventory; re-scans stay publish-free.
 */
export async function recordUnboxScanOpened(
  organizationId: string,
  receivingId: number,
  actorStaffId: number | null,
  scanId: number | null,
  trackingNumber?: string,
): Promise<{ firstOpen: boolean }> {
  let firstOpen = false;
  try {
    const prior = await pool.query<{ opened_at: string | null }>(
      `SELECT opened_at FROM receiving_unbox
        WHERE receiving_id = $1 AND organization_id = $2 LIMIT 1`,
      [receivingId, organizationId],
    );
    firstOpen = (prior.rows[0]?.opened_at ?? null) == null;
    await upsertReceivingUnbox(pool, organizationId, receivingId, {
      openedAt: 'now',
      openedBy: actorStaffId,
      deriveIntakePath: true,
    });
  } catch (err) {
    firstOpen = false;
    console.warn('[recordUnboxScanOpened] receiving_unbox.opened_at stamp skipped:', err);
  }

  const clientEventId =
    scanId != null
      ? `unbox-scan-opened:${organizationId}:${receivingId}:${scanId}`
      : `unbox-scan-opened:${organizationId}:${receivingId}:manual`;
  try {
    // Phase 2 (ops-events unification): this event is by definition the Unbox
    // surface — stamp its Studio-node binding when the org has one published.
    const workflowNodeId = await resolveSurfaceWorkflowNodeId('unbox', organizationId);
    await recordOpsEvent({
      organizationId,
      entityType: 'receiving',
      entityId: receivingId,
      eventType: UNBOX_SCAN_OPENED_EVENT,
      actorStaffId,
      clientEventId,
      workflowNodeId,
      payload: trackingNumber ? { trackingNumber } : {},
    });
  } catch (err) {
    console.warn('[recordUnboxScanOpened] ops_events write skipped:', err);
  }

  return { firstOpen };
}
