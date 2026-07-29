import pool from '@/lib/db';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { recordOpsEvent } from '@/lib/ops-events';
import { resolveSurfaceWorkflowNodeId } from '@/lib/stations/surface-workflow-node';
import { upsertReceivingTriage } from '@/lib/receiving/streets/carton-street-write';
import { promoteShipmentTicketToReceiving } from '@/lib/support/ticket-link';
import type { UnboxScanKind } from '@/lib/receiving/unbox-scan-kind';

export type ReceivingScanSource = 'zoho_po' | 'unmatched';

/** Operator surface that issued the scan — drives independent triage vs unbox stamps. */
export type ReceivingIntakeSurface = 'triage' | 'unbox';

export interface RecordReceivingScanOptions {
  /** Default `triage` — only triage (door) scans stamp received_at/received_by. */
  intakeSurface?: ReceivingIntakeSurface;
  /**
   * Default `work`. `lookup` = the operator scanned an ALREADY-UNBOXED carton to
   * inspect it, so this call must not claim the work:
   *   - `scanned_at` / `scanned_by` are preserved (the row is UNIQUE per
   *     (tracking_number, receiving_id), so overwriting them renamed whoever
   *     actually unboxed the carton to whoever last looked at it),
   *   - no `TRACKING_SCANNED` ops event (that is the work event),
   *   - no triage door stamp.
   * The lookup itself is recorded by `recordUnboxLookupScan` as its own
   * append-only event. Classify with `resolveUnboxScanKind`.
   */
  scanKind?: UnboxScanKind;
}

/**
 * Register the scanned tracking into the STN master and link it to the scan +
 * carton. Returns true when STN owns the tracking (so the carton needs no legacy
 * tracking string — MAIN criterion). Runs on EVERY scan now (the old
 * RECEIVING_UNIFIED_INBOUND gate is removed): STN is the tracking source of
 * record, and the legacy `receiving.receiving_tracking_number` is written ONLY
 * as a fallback when this returns false (see recordReceivingScan). Best-effort:
 * a registration failure returns false so the fallback still records the scan.
 */
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

  // A lookup keeps the existing attribution. `receiving_scans` is UNIQUE on
  // (tracking_number, receiving_id) — one row per carton+tracking, NOT an
  // append-only log — so the work branch's `SET scanned_at/scanned_by` is what
  // let an inspection scan rename the original worker. On a first-ever row for
  // this tracking the INSERT still records the operator (nothing to preserve).
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
      // Phase 2 (ops-events unification): stamp the tenant's Studio-node
      // "where" axis. The scan's surface maps 1:1 onto a SURFACE_REGISTRY key
      // (triage door scan vs unbox bench scan); best-effort → null when the
      // org has no published station_definitions binding.
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

  await linkScanToStn(scanId, receivingId, trackingNumber, source);

  // Door-arrival stamp — TRIAGE surface only. Unbox scans must not touch the
  // door stamps so the two modes stay independent on one carton. Wave-3 writer
  // inversion: the stamp lands DIRECTLY on the receiving_triage street table
  // (COALESCE-once inside the helper — a re-scan never re-stamps the door);
  // the spine columns are no longer written and are dropped in Wave 4.
  if (intakeSurface === 'triage' && orgId && !isLookup) {
    await upsertReceivingTriage(pool, orgId, receivingId, {
      doorReceivedAt: 'now', // rendered as SQL NOW() by the helper
      doorReceivedBy: staffId,
    });
  }

  return scanId;
}
