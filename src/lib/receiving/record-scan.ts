import pool from '@/lib/db';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { recordOpsEvent } from '@/lib/ops-events';
import { resolveSurfaceWorkflowNodeId } from '@/lib/stations/surface-workflow-node';
import { receivingTriageUpsertStatement } from '@/lib/receiving/streets/carton-street-write';
import { tenantQueriesOneTrip } from '@/lib/tenancy/db';
import { promoteShipmentTicketToReceiving } from '@/lib/support/ticket-link';
import { NOTIFIABLE_EVENTS } from '@/lib/notifications/event-vocabulary';
import { promoteWatchedArrival } from '@/lib/receiving/watched-arrival';
import type { OrgId } from '@/lib/tenancy/constants';
import type { UnboxScanKind } from '@/lib/receiving/unbox-scan-kind';
import { publishOpsEventLogged } from '@/lib/realtime/publish';

type ReceivingScanSource = 'zoho_po' | 'unmatched';

/** Operator surface that issued the scan — drives independent triage vs unbox stamps. */
export type ReceivingIntakeSurface = 'triage' | 'unbox';

export interface RecordReceivingScanOptions {
  /** Default `triage` — only triage (door) scans stamp received_at/received_by. */
  intakeSurface?: ReceivingIntakeSurface;
  /** Default `work`. */
  scanKind?: UnboxScanKind;
  /** Default `true`. */
  registerTracking?: boolean;
  /** Authenticated phone intent correlation; actor still comes from the route session. */
  phoneActivity?: {
    mobileScanEventId?: number | null;
    clientEventId?: string | null;
  } | null;
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

/**
 * The writes that put a scan on a rail: the `receiving_scans` row (Arrival
 * membership, and the scan id every follow-up keys on) and, for a triage work
 * scan, the COALESCE-once door stamp. The FIRST statement returns the scan id.
 * Statements only — the caller sends them, ideally in the same round trip as
 * its own read. Everything else a scan does is {@link recordReceivingScanFollowups}.
 */
export function receivingScanMembershipStatements(
  orgId: string,
  receivingId: number,
  trackingNumber: string,
  carrier: string,
  staffId: number | null,
  source: ReceivingScanSource,
  options: Pick<RecordReceivingScanOptions, 'intakeSurface' | 'scanKind'> = {},
): Array<{ text: string; params: unknown[] }> {
  const intakeSurface: ReceivingIntakeSurface = options.intakeSurface ?? 'triage';
  const isLookup = (options.scanKind ?? 'work') === 'lookup';

  // A lookup keeps the existing attribution.
  const conflictSet = isLookup
    ? `SET carrier = COALESCE(EXCLUDED.carrier, receiving_scans.carrier),
           intake_surface = COALESCE(receiving_scans.intake_surface, EXCLUDED.intake_surface)`
    : `SET scanned_at = EXCLUDED.scanned_at,
           scanned_by = EXCLUDED.scanned_by,
           carrier = COALESCE(EXCLUDED.carrier, receiving_scans.carrier),
           intake_surface = COALESCE(receiving_scans.intake_surface, EXCLUDED.intake_surface)`;

  const statements: Array<{ text: string; params: unknown[] }> = [
    {
      text: `INSERT INTO receiving_scans
               (receiving_id, tracking_number, carrier, scanned_at, scanned_by, source, organization_id, intake_surface)
             VALUES ($1, $2, $3, NOW(), $4, $5, $6::uuid, $7)
             ON CONFLICT (tracking_number, receiving_id) DO UPDATE
               ${conflictSet}
             RETURNING id`,
      params: [receivingId, trackingNumber, carrier || null, staffId, source, orgId, intakeSurface],
    },
  ];
  // Door-arrival stamp — TRIAGE surface only.
  if (intakeSurface === 'triage' && !isLookup) {
    statements.push(
      receivingTriageUpsertStatement(orgId, receivingId, {
        doorReceivedAt: 'now', // rendered as SQL NOW() by the helper
        doorReceivedBy: staffId,
      }),
    );
  }
  return statements;
}

/**
 * What a recorded scan does after its membership writes landed: the
 * TRACKING_SCANNED ops event, the STN link (and the shipment→receiving ticket
 * promotion it carries), and for a triage work scan the arrival event and the
 * watched-arrival promotion. None of it decides which rail shows the carton.
 */
export async function recordReceivingScanFollowups(
  orgId: string,
  scanId: number,
  receivingId: number,
  trackingNumber: string,
  carrier: string,
  staffId: number | null,
  source: ReceivingScanSource,
  options: RecordReceivingScanOptions = {},
): Promise<void> {
  const intakeSurface: ReceivingIntakeSurface = options.intakeSurface ?? 'triage';
  const isLookup = (options.scanKind ?? 'work') === 'lookup';

  try {
    // TRACKING_SCANNED is the WORK event. A lookup records its own
    // RECEIVING_LOOKUP_SCAN event instead (recordUnboxLookupScan), so the two
    // never blur in throughput or actor-attribution reads.
    if (!isLookup) {
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

  if (intakeSurface === 'triage' && !isLookup) {
    /* ARRIVAL — the event a pre-arrival tracking watch waits on. */
    try {
      const arrivalEventId = await recordOpsEvent({
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
          ...(options.phoneActivity
            ? {
                origin: 'phone',
                surface: '/m/scan',
                client_event_id: options.phoneActivity.clientEventId ?? null,
                mobile_scan_event_id: options.phoneActivity.mobileScanEventId ?? null,
                subject_entity_type: 'receiving',
                subject_id: String(receivingId),
                subject_title: `Carton ${receivingId}`,
                subject_identifier: trackingNumber,
              }
            : null),
        },
      });
      if (arrivalEventId != null && options.phoneActivity) {
        await publishOpsEventLogged({
          organizationId: orgId,
          id: arrivalEventId,
          eventType: NOTIFIABLE_EVENTS['receiving.carton.arrived'].key,
          actorStaffId: staffId,
          source: 'receiving.arrival',
        }).catch(() => {});
      }
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
  const orgRow = await pool.query<{ organization_id: string }>(
    'SELECT organization_id FROM receiving_carton WHERE id = $1 LIMIT 1',
    [receivingId],
  );
  const orgId = orgRow.rows[0]?.organization_id;
  if (!orgId) throw new Error(`recordReceivingScan: receiving ${receivingId} not found`);

  const [scan] = await tenantQueriesOneTrip<{ id: number }>(
    orgId as OrgId,
    receivingScanMembershipStatements(orgId, receivingId, trackingNumber, carrier, staffId, source, options),
    pool,
  );
  const scanId = Number(scan!.rows[0]!.id);
  await recordReceivingScanFollowups(orgId, scanId, receivingId, trackingNumber, carrier, staffId, source, options);
  return scanId;
}
