/** Outbound verb state — the ROW predicates the orders verb catalog binds to. */

import { hasLeftWarehouse } from '@/lib/order-lifecycle';
import type { VerbDirection } from '@/lib/selection/selection-actions';

/** The facts an outbound verb reads off a selected row. */
export interface OutboundVerbRow {
  /** `packer_logs.created_at` — the pack scan. */
  packed_at?: string | null;
  /** `station_activity_logs` SHIP_CONFIRM — the dock scan-out. */
  ship_confirmed_at?: string | null;
  /** `shipping_tracking_numbers.latest_status_category`. */
  latest_status_category?: string | null;
  is_terminal?: boolean | null;
  shipment_id?: number | string | null;
  shipping_tracking_number?: string | null;
  tracking_number?: string | null;
  sku?: string | null;
}

/** The signal bag `order-lifecycle` reads, built from a selection row. */
function signals(row: OutboundVerbRow) {
  return {
    packedAt: row.packed_at ?? null,
    shipConfirmedAt: row.ship_confirmed_at ?? null,
    latestStatusCategory: row.latest_status_category ?? null,
    isTerminal: row.is_terminal ?? null,
  };
}

/** Has this package physically left — scanned out, or the carrier has custody? */
export function hasLeftBuilding(row: OutboundVerbRow): boolean {
  return hasLeftWarehouse(signals(row));
}

/** Packed into a carton (the pack scan landed). */
export function isPacked(row: OutboundVerbRow): boolean {
  return Boolean(row.packed_at);
}

/** Still workable on the floor: */
export function isInBuilding(row: OutboundVerbRow): boolean {
  return !isPacked(row) && !hasLeftBuilding(row);
}

/** A shipping document exists to reprint once the unit is packed. */
export function hasShippingPaperwork(row: OutboundVerbRow): boolean {
  return isPacked(row) || hasLeftBuilding(row);
}

/** The label a dock scan reads — canonical tracking, either spelling. */
export function trackingForScanOut(row: OutboundVerbRow): string | null {
  const raw = String(row.shipping_tracking_number ?? row.tracking_number ?? '').trim();
  return raw || null;
}

/** The shipment a scan-out is undone against. */
export function shipmentIdForScanOut(row: OutboundVerbRow): number | null {
  const id = Number(row.shipment_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Direction of the ONE reversible scan-out verb. */
export function scanOutDirection(row: OutboundVerbRow): VerbDirection {
  return hasLeftBuilding(row) ? 'undo' : 'do';
}

/** Can this row be acted on at all in the given direction? */
export function canScanOut(row: OutboundVerbRow, direction: VerbDirection): boolean {
  return direction === 'undo'
    ? shipmentIdForScanOut(row) != null
    : trackingForScanOut(row) != null;
}
