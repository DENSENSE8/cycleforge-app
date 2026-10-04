/**
 * A held unmatched dock scan (an `outbound` orders_exception) resolved to an
 * order: the box physically left when it was scanned, so the scan-out record
 * is completed through the ONE scan-out writer (`scanOutKnownShipment`),
 * attributed to the staffer who scanned it, at the instant they scanned it.
 * Pack-scan misses (`packer`) never replay — a pack scan is not a handoff.
 *
 * Callers: {@link syncOrderExceptionsWithScanOutReplay} (every exception sweep,
 * including the CSV import) and the package record's link-to-order resolve.
 */

import { syncOrderExceptionsToOrders, type OrderExceptionSyncResult } from '@/lib/orders-exceptions';
import type { SyncProgress } from '@/lib/orders-sync/types';
import { publishActivityLogged } from '@/lib/realtime/publish';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import {
  resolveScanOutShipment,
  scanOutBlockedMessage,
  scanOutKnownShipment,
  type ScanOutBlockReason,
  type ScanOutInput,
  type ScanOutResult,
} from './scan-out';

/** The held scan as the replay reads it. */
export interface HeldScan {
  exceptionId: number;
  sourceStation: string;
  /** Who scanned it at the dock — the scan-out is theirs. */
  staffId: number | null;
  tracking: string;
  /** When they scanned it: PST wall clock `YYYY-MM-DD HH24:MI:SS` (the writer's backdate form). */
  scannedAt: string;
}

export type HeldScanOutReplay =
  | { kind: 'skipped'; exceptionId: number; reason: 'not_scan_out' | 'no_shipment' }
  | { kind: 'blocked'; exceptionId: number; shipmentId: number; blockReason: ScanOutBlockReason }
  | { kind: 'replayed'; exceptionId: number; shipmentId: number; outcome: 'confirmed' | 'duplicate'; activityId: number | null };

export interface HeldScanOutReplayDeps {
  /** The dock's own label → shipment resolution (registry, then the order's tracking). */
  resolveShipment: (scan: string, organizationId: string) => Promise<number | null>;
  scanOut: (input: ScanOutInput & { shipmentId: number }) => Promise<ScanOutResult>;
  /** Append a line to the held exception's notes (why the scan-out was not recorded). */
  noteException: (organizationId: string, exceptionId: number, note: string) => Promise<unknown>;
  /** Wake live surfaces for a newly written SHIP_CONFIRM. */
  publishConfirmed: (organizationId: string, activityId: number, staffId: number | null, tracking: string) => Promise<unknown>;
}

/**
 * Replay one resolved held scan. `shipmentId` is the package the resolve linked
 * (package-record resolve); null = resolve the label the way a dock re-scan would.
 * Idempotent: an existing SHIP_CONFIRM comes back as `duplicate`.
 */
export async function replayHeldScanOut(
  organizationId: string,
  held: HeldScan,
  shipmentId: number | null,
  deps: HeldScanOutReplayDeps = defaultReplayDeps,
): Promise<HeldScanOutReplay> {
  const { exceptionId } = held;
  if (held.sourceStation !== 'outbound') return { kind: 'skipped', exceptionId, reason: 'not_scan_out' };
  const target = shipmentId ?? (await deps.resolveShipment(held.tracking, organizationId));
  if (target == null) return { kind: 'skipped', exceptionId, reason: 'no_shipment' };

  const result = await deps.scanOut({
    organizationId,
    scan: held.tracking,
    actorStaffId: held.staffId,
    createdAt: held.scannedAt || null,
    origin: 'resolved-miss',
    heldExceptionId: exceptionId,
    shipmentId: target,
  });
  switch (result.kind) {
    case 'blocked':
      await deps.noteException(
        organizationId,
        exceptionId,
        `Scan-out not recorded: ${scanOutBlockedMessage(result.blockReason)}`,
      );
      return { kind: 'blocked', exceptionId, shipmentId: target, blockReason: result.blockReason };
    case 'confirmed':
      if (result.activityId != null) {
        await deps.publishConfirmed(organizationId, result.activityId, held.staffId, held.tracking).catch(() => {});
      }
      return { kind: 'replayed', exceptionId, shipmentId: target, outcome: 'confirmed', activityId: result.activityId };
    case 'duplicate':
      return { kind: 'replayed', exceptionId, shipmentId: target, outcome: 'duplicate', activityId: null };
    case 'unmatched':
      // A known shipment id never comes back unmatched; nothing was written.
      return { kind: 'skipped', exceptionId, reason: 'no_shipment' };
  }
}

/** The held scans behind these exception ids — only dock misses (`outbound`) replay. */
export async function loadHeldScanOuts(orgId: OrgId, exceptionIds: readonly number[]): Promise<HeldScan[]> {
  if (exceptionIds.length === 0) return [];
  const result = await tenantQuery<{
    id: number | string;
    source_station: string;
    staff_id: number | null;
    tracking: string;
    scanned_at: string;
  }>(
    orgId,
    `SELECT oe.id,
            oe.source_station,
            oe.staff_id,
            oe.shipping_tracking_number AS tracking,
            to_char(oe.created_at AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS') AS scanned_at
       FROM orders_exceptions oe
      WHERE oe.organization_id = $1
        AND oe.id = ANY($2::int[])
        AND oe.source_station = 'outbound'`,
    [orgId, exceptionIds],
  );
  return result.rows.map((row) => ({
    exceptionId: Number(row.id),
    sourceStation: row.source_station,
    staffId: row.staff_id != null ? Number(row.staff_id) : null,
    tracking: String(row.tracking ?? '').trim(),
    scannedAt: String(row.scanned_at ?? ''),
  }));
}

/**
 * One exception just resolved onto `shipmentId` (the package record's link):
 * replay it when it was a dock miss; a pack-scan exception loads nothing and is left alone.
 */
export async function replayResolvedScanOut(
  orgId: OrgId,
  exceptionId: number,
  shipmentId: number,
): Promise<HeldScanOutReplay | null> {
  const [held] = await loadHeldScanOuts(orgId, [exceptionId]);
  return held ? replayHeldScanOut(orgId, held, shipmentId) : null;
}

/** An exception sweep plus the scan-outs it completed. */
export interface OrderExceptionSyncWithReplay extends OrderExceptionSyncResult {
  scanOutReplays: HeldScanOutReplay[];
}

/**
 * The exception sweep every caller runs: resolve open exceptions to the orders
 * that now carry their tracking, then complete the scan-out of each resolved
 * dock miss. Replays run one at a time (each reads the latest SHIP_CONFIRM).
 */
export async function syncOrderExceptionsWithScanOutReplay(
  progress: SyncProgress | undefined,
  orgId: OrgId,
): Promise<OrderExceptionSyncWithReplay> {
  const sync = await syncOrderExceptionsToOrders(progress, orgId);
  const held = await loadHeldScanOuts(
    orgId,
    sync.resolved
      .filter((detail) => detail.sourceStation === 'outbound')
      .map((detail) => detail.exceptionId),
  );
  const scanOutReplays: HeldScanOutReplay[] = [];
  for (const scan of held) scanOutReplays.push(await replayHeldScanOut(orgId, scan, null));
  return { ...sync, scanOutReplays };
}

const defaultReplayDeps: HeldScanOutReplayDeps = {
  // Resolve only — `scanOutLabel` on a still-unresolvable label would hold a new miss.
  resolveShipment: resolveScanOutShipment,
  scanOut: (input) => scanOutKnownShipment(input),
  noteException: (organizationId, exceptionId, note) =>
    tenantQuery(
      organizationId,
      `UPDATE orders_exceptions
          SET notes = CASE WHEN COALESCE(notes, '') = '' THEN $3::text ELSE notes || E'\\n' || $3::text END,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2`,
      [exceptionId, organizationId, note],
    ),
  publishConfirmed: (organizationId, activityId, staffId, tracking) =>
    publishActivityLogged({
      organizationId,
      id: activityId,
      station: 'OUTBOUND',
      activityType: 'SHIP_CONFIRM',
      staffId,
      scanRef: tracking,
      source: 'unmatched-scan-out-replay',
    }),
};
