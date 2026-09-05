/**
 * Outbound verb state — the ROW predicates the orders verb catalog binds to.
 *
 * `TABLE_ENGINE_LAW.verbsBindToFields`: a verb's availability and its DIRECTION
 * come from row state, never from the route. This module is where that state is
 * read, once, as pure functions — so "Set condition" is offered because the
 * selected rows are still in the building, not because the URL said
 * `?unshipped`.
 *
 * It replaces `orderBulkActionKeys(orderView)`, the hardcoded per-lane key list
 * the law forbids (deleted 2026-09-05). The lane distinction it encoded was
 * real — pre-pack lanes prep the unit, post-pack lanes reprint the shipping
 * document — but it is a LIFECYCLE fact about the row, and every row already
 * carries it (`packed_at`, `ship_confirmed_at`, the carrier category). Reading
 * it here means a new outbound surface inherits the right verbs with no list to
 * update, and a mixed selection resolves instead of guessing from the URL.
 *
 * Pure + isomorphic: no React, no `Date.now()`, no fetch.
 */

import { hasLeftWarehouse } from '@/lib/order-lifecycle';
import type { VerbDirection } from '@/lib/selection/selection-actions';

/**
 * The facts an outbound verb reads off a selected row.
 *
 * Deliberately a structural subset: the Unshipped feed broadcasts
 * `ShippedOrder` and the Shipped feed broadcasts `PackerRecord`, and both
 * satisfy this. Everything is optional because a narrow selection row (the
 * `⋮` menu at n = 1) may carry less than the grid does — an absent fact reads
 * as "not yet", which is the safe direction for a `do`.
 */
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

/**
 * Still workable on the floor: not packed and not gone.
 *
 * The gate for every PREP verb — assign a picker, set the condition / qty /
 * ship-by, print the SKU label. `some`, not `every`: a selection that contains
 * one in-building row can still be prepped, and the rows it cannot touch are
 * named by the verb's own direction resolution rather than hiding the button.
 */
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

/**
 * Direction of the ONE reversible scan-out verb.
 *
 * Gone → `undo` (delete the SHIP_CONFIRM); still here → `do` (record it).
 * There is no `done`: a dock scan-out is reversible in both directions, which
 * is exactly why it is one verb and not two.
 */
export function scanOutDirection(row: OutboundVerbRow): VerbDirection {
  return hasLeftBuilding(row) ? 'undo' : 'do';
}

/** Can this row be acted on at all in the given direction? */
export function canScanOut(row: OutboundVerbRow, direction: VerbDirection): boolean {
  return direction === 'undo'
    ? shipmentIdForScanOut(row) != null
    : trackingForScanOut(row) != null;
}
