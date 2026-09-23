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
  /**
   * Default `true`. Set `false` when the scanned value was resolved as a pure
   * PO/order identity, not a carrier tracking number — e.g. a vendor whose
   * Zoho "PO Number" field literally IS their own order id (Home Depot), with
   * no separate shipment tracking. Registering that value into
   * `shipping_tracking_numbers` would fabricate a tracking number that never
   * existed, so the STN link (and `receiving_carton.shipment_id` stamp) is
   * skipped — the scan is still audited in `receiving_scans`, just never
   * promoted to a shipment. Same principle as a local-pickup carton with no
   * tracking (`fulfillment-mode.ts`).
   */
  registerTracking?: boolean;
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

/**
 * Idempotent scan audit row — upserts scanned_at + scanned_by per operator.
 *
 * Returns the scan id, as it always has. The watched-arrival signal does NOT
 * ride the return value: it is pushed to the SCANNING operator's own inbox
 * channel from inside `promoteWatchedArrival`, because the eight door branches
 * that call this helper assemble eight different responses, and a surface that
 * never reads the response (the desk feed rail, the `/m` arrival station's
 * navigation away) would silently lose the alert. One push, every door.
 */
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

  if (options.registerTracking ?? true) {
    await linkScanToStn(scanId, receivingId, trackingNumber, source);
  }

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

    /*
     * ARRIVAL — the event a pre-arrival tracking watch waits on.
     *
     * `TRACKING_SCANNED` above is the THROUGHPUT event, and its key is the ops
     * spine's own SCREAMING name. The notification vocabulary never declared
     * that name, so the fan-out worker drops it as non-notifiable — which is
     * why a `staff_subscriptions` rule row carrying
     * `match_event_keys = ['receiving.carton.arrived']` could be WRITTEN and
     * could never FIRE: nothing in the repo emitted that key.
     *
     * It is emitted HERE rather than from a route because every door path
     * (`/api/receiving/lookup-po`, `/api/receiving-entry`,
     * `/api/receiving/touch-scan`, desk triage, `/m` arrival, unbox) funnels
     * through this helper. One emit covers them all; emitting from one route
     * would leave the other five silently unwatched.
     *
     * TRIAGE only, and for the same reason the door stamp is triage only: an
     * unbox-bench scan of a carton that arrived yesterday is not an arrival.
     *
     * IDEMPOTENT twice over. `receiving_scans` is UNIQUE on
     * (tracking_number, receiving_id), so a re-scan resolves the SAME scanId
     * and this `client_event_id` — which is globally unique on ops_events —
     * makes the second write a no-op. Its own prefix, never the TRACKING_
     * SCANNED one, or that uniqueness would swallow the arrival instead. The
     * fan-out `dedupKey` (`ce:…`) is the second line of defence.
     *
     * `trackingNumber` is the narrowing fact the worker reads
     * (`readMatchFacts`) and canonicalises, so keystrokes typed with spaces
     * still match a watch stored canonical.
     */
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

    /*
     * A WATCHED box jumps the queue, and the person holding it is told.
     *
     * The notification arm tells the WATCHER. It cannot tell the scanner: the
     * fan-out deliberately never notifies you about your own action, so
     * without this the one operator physically holding the wanted package is
     * the only person in the building who does not know it is wanted.
     *
     * `promoteWatchedArrival` therefore does both — flags the carton urgent
     * (`is_priority`, the same flag and writer the pending-order match uses,
     * which floats it into the unbox queue's pinned urgent band through
     * `RECEIVING_PRIORITY_RANK_SQL`) and pushes the scanner their own alert.
     * Best-effort: a carton that arrived outranks a flag on it.
     */
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
