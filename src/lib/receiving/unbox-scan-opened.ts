import pool from '@/lib/db';
import { recordOpsEvent } from '@/lib/ops-events';
import { resolveSurfaceWorkflowNodeId } from '@/lib/stations/surface-workflow-node';
import { upsertReceivingUnbox } from '@/lib/receiving/streets/carton-street-write';

export {
  UNBOX_SCAN_OPENED_EVENT,
  unboxOpenedPredicateSql,
} from '@/lib/receiving/unbox-scan-opened-sql';

import { UNBOX_SCAN_OPENED_EVENT } from '@/lib/receiving/unbox-scan-opened-sql';

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
