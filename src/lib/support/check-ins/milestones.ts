/**
 * Which fulfillment milestone opens an order's post-purchase check-in, when
 * it falls due, and whether the order may have one at all. Pure — the
 * projection writer (milestones-db.ts) feeds it folded order facts.
 *
 * Triggers, strongest first:
 *   picked_up        a counter-pickup order was handed over (SHIP_CONFIRM)
 *   delivered        every shipment of the order is delivered (the last arrival)
 *   shipped_fallback delivery is unknown: the carrier accepted / the box was
 *                    scanned out — check in after the longer fallback delay
 * The trigger instant must be on/after the program start, so historical
 * orders never project.
 */
import type { OrderCheckInTrigger } from '@/lib/support/conversation/model';
import {
  orderDeliveredAt,
  orderShippedAt,
  type OrderGroupFacts,
} from '@/lib/support/orders/order-facts';
import { orderHasCustomerContactPath } from '@/lib/support/orders/order-platform';
import { SUPPORT_CHECK_IN_DELAYS_MS } from './config';

/** Order statuses that end the sale — no check-in for a cancelled or refunded order. */
export const CHECK_IN_CLOSED_ORDER_STATUSES: Readonly<Record<string, true>> = {
  canceled: true,
  cancelled: true,
  refunded: true,
  voided: true,
};

export interface OrderCheckInMilestone {
  /** The order's representative `orders.id` — the projection key. */
  orderId: number;
  triggerKind: OrderCheckInTrigger;
  /** What fired it: `shipment:<id>` for carrier facts, `order:<id>` for a handover. */
  triggerRef: string;
  triggerAt: string;
  dueAt: string;
  /** Set when the order would qualify but may not get a check-in; the row lands `not_applicable`. */
  notApplicableReason: string | null;
}

/** Why an order with a milestone may not get a check-in; null = eligible. */
export function orderCheckInIneligibleReason(group: OrderGroupFacts): string | null {
  if (group.anyAfn) return 'Fulfilled by Amazon (AFN) — Amazon handles the buyer.';
  if (group.statuses.length > 0 && group.statuses.every((s) => CHECK_IN_CLOSED_ORDER_STATUSES[s] === true)) {
    return `Order is ${group.statuses[0]}.`;
  }
  if (
    !orderHasCustomerContactPath({
      platformSlug: group.platform.slug,
      customerEmail: group.customer.email,
      customerPhone: group.customer.phone,
    })
  ) {
    return 'No way to reach the customer (no email, phone or marketplace messaging).';
  }
  return null;
}

/**
 * The milestone that opens this order's check-in, or null when none has
 * happened yet (or it happened before the program start).
 */
export function deriveOrderCheckInMilestone(
  group: OrderGroupFacts,
  opts: { programStartMs: number },
): OrderCheckInMilestone | null {
  let pick: { kind: OrderCheckInTrigger; ref: string; at: string } | null = null;

  if (group.pickup && group.shipConfirmAt) {
    pick = { kind: 'picked_up', ref: `order:${group.representativeOrderId}`, at: group.shipConfirmAt };
  } else {
    const deliveredAt = orderDeliveredAt(group);
    if (deliveredAt) {
      const last = group.shipments.find((s) => s.deliveredAt === deliveredAt) ?? group.shipments[0];
      pick = { kind: 'delivered', ref: `shipment:${last.shipmentId}`, at: deliveredAt };
    } else {
      const shippedAt = orderShippedAt(group);
      if (shippedAt) {
        const first = group.shipments.find((s) => (s.carrierAcceptedAt ?? s.shipConfirmAt) === shippedAt);
        pick = {
          kind: 'shipped_fallback',
          ref: first ? `shipment:${first.shipmentId}` : `order:${group.representativeOrderId}`,
          at: shippedAt,
        };
      }
    }
  }

  if (!pick) return null;
  const atMs = Date.parse(pick.at);
  if (!Number.isFinite(atMs) || atMs < opts.programStartMs) return null;

  return {
    orderId: group.representativeOrderId,
    triggerKind: pick.kind,
    triggerRef: pick.ref,
    triggerAt: new Date(atMs).toISOString(),
    dueAt: new Date(atMs + SUPPORT_CHECK_IN_DELAYS_MS[pick.kind]).toISOString(),
    notApplicableReason: orderCheckInIneligibleReason(group),
  };
}
