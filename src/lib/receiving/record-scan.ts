import pool from '@/lib/db';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { recordOpsEvent } from '@/lib/ops-events';
import { resolveSurfaceWorkflowNodeId } from '@/lib/stations/surface-workflow-node';
import { upsertReceivingTriage } from '@/lib/receiving/streets/carton-street-write';
import { promoteShipmentTicketToReceiving } from '@/lib/support/ticket-link';
import { NOTIFIABLE_EVENTS } from '@/lib/notifications/event-vocabulary';
import { promoteWatchedArrival } from '@/lib/receiving/watched-arrival';
import type { OrgId } from '@/lib/tenancy/constants';
import type { UnboxScanKind } from '@/lib/receiving/unbox-scan-kind';

export type ReceivingScanSource = 'zoho_po' | 'unmatched';

/** Operator surface that issued the scan — drives independent triage vs unbox stamps. */
export type ReceivingIntakeSurface = 'triage' | 'unbox';

export interface RecordReceivingScanOptions {
  /** Default `triage` — only triage (door) scans stamp received_at/received_by. */
  intakeSurface?: ReceivingIntakeSurface;
  /** Default `work`. */
  scanKind?: UnboxScanKind;
  /** Default `true`. */
  registerTracking?: boolean;
}

/** Register the scanned tracking into the STN master and link it to the scan + carton. */
async function linkScanToStn(
  scanId: number,
  receivingId: number,
  trackingNumber: string,
  source: ReceivingScanSource,
): Promise<boolean> {
  try {
    const orgRow = await pool.query<{ organization_id: string }>(
      'SELECT organization_id FROM receiving_carton WHERE id = $1 LIMIT 1',
      [receivingId],
    );
    const orgId = orgRow.rows[0]?.organization_id;
    const stn = await registerShipmentPermissive({
      trackingNumber,
      sourceSystem: `receiving_scan:${source}`,
    }, orgId);
    const shipmentId = stn?.id ?? null;
    if (shipmentId == null) return false;
    await pool.query(
      `UPDATE receiving_scans SET shipment_id = $2 WHERE id = $1 AND shipment_id IS DISTINCT FROM $2`,
      [scanId, shipmentId],
    );
    await pool.query(
      `UPDATE receiving_carton SET shipment_id = $2 WHERE id = $1 AND shipment_id IS NULL`,
      [receivingId, shipmentId],
    );
    // Pre-intake ticket↔STN links (support linked tracking before the carton
    // existed) promote to RECEIVING so unbox resolves the ticket on scan.
    if (orgId) {
      await promoteShipmentTicketToReceiving({
        orgId,
        shipmentId,
        receivingId,
      });
    }
    return true;
  } catch (err) {
    console.warn(`[recordReceivingScan] linkScanToStn skipped for scan=${scanId}:`, err);
    return false;
  }
}

/** Idempotent scan audit row — upserts scanned_at + scanned_by per operator. */
export async function recordReceivingScan(
  receivingId: number,
  trackingNumber: string,
  carrier: string,
  staffId: number | null,
  source: ReceivingScanSource,
  options: RecordReceivingScanOptions = {},
): Promise<number> {
  const intakeSurface: ReceivingIntakeSurface = options.intakeSurface ?? 'triage';
  const scanKind: UnboxScanKind = options.scanKind ?? 'work';
  const isLookup = scanKind === 'lookup';

  // A lookup keeps the existing attribution.
  const conflictSet = isLookup
    ? `SET carrier = COALESCE(EXCLUDED.carrier, receiving_scans.carrier),
           intake_surface = COALESCE(receiving_scans.intake_surface, EXCLUDED.intake_surface)`
    : `SET scanned_at = EXCLUDED.scanned_at,
           scanned_by = EXCLUDED.scanned_by,
           carrier = COALESCE(EXCLUDED.carrier, receiving_scans.carrier),
           intake_surface = COALESCE(receiving_scans.intake_surface, EXCLUDED.intake_surface)`;

  const result = await pool.query<{ id: number }>(
    `INSERT INTO receiving_scans
       (receiving_id, tracking_number, carrier, scanned_at, scanned_by, source, organization_id, intake_surface)
     VALUES ($1, $2, $3, NOW(), $4, $5, (SELECT organization_id FROM receiving_carton WHERE id = $1), $6)
     ON CONFLICT (tracking_number, receiving_id) DO UPDATE
       ${conflictSet}
     RETURNING id`,
    [receivingId, trackingNumber, carrier || null, staffId, source, intakeSurface],
  );
  const scanId = Number(result.rows[0].id);

  // Resolved once — used by both the ops-event stamp and the triage door stamp.
  const orgRow = await pool.query<{ organization_id: string }>(
    'SELECT organization_id FROM receiving_carton WHERE id = $1 LIMIT 1',
    [receivingId],
  );
  const orgId = orgRow.rows[0]?.organization_id ?? null;

  try {
    // TRACKING_SCANNED is the WORK event. A lookup records its own
    // RECEIVING_LOOKUP_SCAN event instead (recordUnboxLookupScan), so the two
    // never blur in throughput or actor-attribution reads.
    if (orgId && !isLookup) {
      // Phase 2 (ops-events unification):
      const workflowNodeId = await resolveSurfaceWorkflowNodeId(
        intakeSurface === 'unbox' ? 'unbox' : 'triage',
        orgId,
      );
      await recordOpsEvent({
        organizationId: orgId,
        entityType: 'receiving',
        entityId: receivingId,
        eventType: 'TRACKING_SCANNED',
        actorStaffId: staffId,
        clientEventId: `receiving-scan:${scanId}`,
        workflowNodeId,
        payload: {
          trackingNumber,
          carrier: carrier || null,
          source,
          receivingId,
          scanId,
          intakeSurface,
        },
      });
    }
  } catch (err) {
    console.warn('[recordReceivingScan] ops_events write skipped:', err);
  }

  if (options.registerTracking ?? true) {
    await linkScanToStn(scanId, receivingId, trackingNumber, source);
  }

  // Door-arrival stamp — TRIAGE surface only.
  if (intakeSurface === 'triage' && orgId && !isLookup) {
    await upsertReceivingTriage(pool, orgId, receivingId, {
      doorReceivedAt: 'now', // rendered as SQL NOW() by the helper
      doorReceivedBy: staffId,
    });

    /* ARRIVAL — the event a pre-arrival tracking watch waits on. */
    try {
      await recordOpsEvent({
        organizationId: orgId,
        entityType: 'receiving',
        entityId: receivingId,
        eventType: NOTIFIABLE_EVENTS['receiving.carton.arrived'].key,
        actorStaffId: staffId,
        clientEventId: `receiving-arrived:${scanId}`,
        payload: {
          trackingNumber,
          carrier: carrier || null,
          source,
          receivingId,
          scanId,
        },
      });
    } catch (err) {
      console.warn('[recordReceivingScan] arrival notification skipped:', err);
    }

    /* A WATCHED box jumps the queue, and the person holding it is told. */
    try {
      await promoteWatchedArrival({
        orgId: orgId as OrgId,
        receivingId,
        trackingNumber,
        scannedByStaffId: staffId,
      });
    } catch (err) {
      console.warn('[recordReceivingScan] watched-arrival promotion skipped:', err);
    }
  }

  return scanId;
}
