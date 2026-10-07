/**
 * Command Search order chip — Allocate's own stage, never the channel status
 * ShipStation writes onto `orders.status`.
 *
 * The outbound internal status (`src/lib/status/record-status.ts`) over the
 * live feed's partition (`sqlOrderDeskStage` over the To-ship scope): To pick
 * · Picked · Packed, then Scanned out once the dock confirms. A carrier that
 * has actually moved the package is Fulfilled (that order has left Allocate).
 * Buyer cancel wins over every stage.
 */

import { BUYER_CANCELLED_STATUS } from '@/lib/orders/buyer-cancelled';
import { sqlOrderHasShipConfirm } from '@/lib/orders/order-grain-sql';
import { getDeskView } from '@/lib/outbound/desk-views';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { OUTBOUND_INTERNAL_STATUS, resolveOutboundInternalStatus } from '@/lib/status/record-status';

const word = OUTBOUND_INTERNAL_STATUS;

/** Fulfilled desk label — the archive, not ShipStation's "shipped". */
export const ALLOCATE_SEARCH_FULFILLED = getDeskView('shipped').label;

export interface AllocateSearchSignals {
  buyerCancelled: boolean;
  /** Amazon fulfilled — never on Allocate. */
  amazonFulfilled: boolean;
  /** Carrier accepted, in transit, or delivered. A created label is not this. */
  carrierMoved: boolean;
  /** Dock SHIP_CONFIRM. */
  scannedOut: boolean;
  packed: boolean;
  picked: boolean;
}

/** The chip word for one order: Buyer cancel, then Fulfilled once it left Allocate, then the internal status. */
export function allocateSearchStatus(signals: AllocateSearchSignals): string {
  if (!signals.buyerCancelled && (signals.amazonFulfilled || signals.carrierMoved)) return ALLOCATE_SEARCH_FULFILLED;
  return word[resolveOutboundInternalStatus(signals)].label;
}

/**
 * Join `order_stage_facts` as `osf`. Same predicate as `ORDER_STAGE_FACTS_JOIN`;
 * kept here so search can import it without the server-only facts module.
 */
export const ALLOCATE_STAGE_FACTS_JOIN = `
    LEFT JOIN order_stage_facts osf
      ON osf.organization_id = o.organization_id
     AND osf.order_id = o.id`;

/**
 * The same verdict as {@link allocateSearchStatus}, as one SQL expression.
 * Expects `o` (orders), `stn` (its primary shipment), `osf` (`order_stage_facts`).
 */
export function sqlAllocateSearchStatus(): string {
  return `CASE
    WHEN LOWER(COALESCE(o.status, '')) = '${BUYER_CANCELLED_STATUS}' THEN '${word.buyer_cancel.label}'
    WHEN COALESCE(o.fulfillment_channel, '') = 'AFN' THEN '${ALLOCATE_SEARCH_FULFILLED}'
    WHEN ${SHIPPED_BY_CARRIER_SQL} THEN '${ALLOCATE_SEARCH_FULFILLED}'
    WHEN ${sqlOrderHasShipConfirm('o')} THEN '${word.scanned_out.label}'
    WHEN COALESCE(osf.has_pack_scan, false) THEN '${word.packed.label}'
    WHEN COALESCE(osf.has_pick_scan, false) THEN '${word.picked.label}'
    ELSE '${word.to_pick.label}'
  END`;
}
