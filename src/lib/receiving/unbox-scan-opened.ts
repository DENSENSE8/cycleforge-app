import pool from '@/lib/db';
import { recordOpsEvent } from '@/lib/ops-events';
import { resolveSurfaceWorkflowNodeId } from '@/lib/stations/surface-workflow-node';
import {
  receivingUnboxUpsertStatement,
  type StreetUpsertStatement,
} from '@/lib/receiving/streets/carton-street-write';

export {
  UNBOX_SCAN_OPENED_EVENT,
  unboxOpenedPredicateSql,
} from '@/lib/receiving/unbox-scan-opened-sql';

import { UNBOX_SCAN_OPENED_EVENT } from '@/lib/receiving/unbox-scan-opened-sql';

/**
 * The Unbox rail membership write: COALESCE-once `receiving_unbox.opened_at`.
 * A statement, so a scan route can send it in the same round trip as its read;
 * pair it with {@link recordUnboxScanOpenedEvent} afterwards.
 */
export function unboxOpenedStampStatement(
  organizationId: string,
  receivingId: number,
  actorStaffId: number | null,
): StreetUpsertStatement {
  return receivingUnboxUpsertStatement(organizationId, receivingId, {
    openedAt: 'now',
    openedBy: actorStaffId,
    deriveIntakePath: true,
  });
}

/** The UNBOX_SCAN_OPENED ops event for a scan whose `opened_at` stamp already landed. */
export async function recordUnboxScanOpenedEvent(
  organizationId: string,
  receivingId: number,
  actorStaffId: number | null,
  scanId: number | null,
  trackingNumber?: string,
): Promise<void> {
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
}

/** Record that this carton entered the operator's Unbox work queue via a scan. */
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
    const stamp = unboxOpenedStampStatement(organizationId, receivingId, actorStaffId);
    await pool.query(stamp.text, stamp.params);
  } catch (err) {
    firstOpen = false;
    console.warn('[recordUnboxScanOpened] receiving_unbox.opened_at stamp skipped:', err);
  }

  await recordUnboxScanOpenedEvent(organizationId, receivingId, actorStaffId, scanId, trackingNumber);
  return { firstOpen };
}
