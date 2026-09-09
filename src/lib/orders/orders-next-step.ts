/**
 * Where an order goes NEXT — the compound STATUS cell's second line.
 *
 * The state pill says where a row IS. This says which station picks it up
 * after that, or that nothing does because it has left the building. Operator
 * 2026-09-04: *"for the status column the next station or status or where its
 * going should display there like current status on the 1st row and 2nd row
 * next status update and when scanned out display like a done or completed for
 * the last status marker."*
 *
 * ## It reads the canonical projection, it does not add a second one
 *
 * The stage vocabulary and its precedence live in `@/lib/order-lifecycle` —
 * one projection, deliberately, after the same rule set was re-derived in three
 * places and had to agree by coincidence. So this module is a MAPPING from that
 * stage to a face, and nothing else: no `shipment_id` test of its own, no
 * second opinion about what counts as packed. If the pipeline gains a stage,
 * it gains one there and this map gains a row.
 *
 * The verbs are the operator's, taken from the orders field catalog rather than
 * from the stage ids: `PENDING → Pick`, because the desk calls that step Pick
 * (`orders.picked`, stage labels Pick / Picked) even though the feed still
 * stamps it on the legacy tester columns.
 *
 * ## Terminal is stated, never left blank
 *
 * After the dock, the second line is the *next carrier milestone* (the same
 * grammar as pre-dock stations): Pre-Transit → In Transit → Out for delivery
 * → Delivered. Delivered / Returned stay a finished word. An empty line still
 * reads as missing, so there is always a word.
 *
 * Pure and isomorphic: no React, no DOM, no clock. The lateness question is the
 * DATES column's, and it is computed from the surface's shared `nowMs`.
 */

import type { CompoundNextStep } from '@/components/tables/compound/compound-row-model';
import {
  hasLeftWarehouse,
  resolveOrderLifecycleStage,
  resolveOutboundStage,
  type OrderLifecycleStage,
} from '@/lib/order-lifecycle';
import type { ShippedOrder } from '@/types/orders';

/**
 * The row facts this reads. A superset of `ShippedOrder` because
 * `has_tech_scan` is a projection the orders feed selects
 * (`sqlOrderHasTechScan`) but the leaf row type does not declare — the same
 * shape `resolveRowStatus` reads.
 */
export type OrdersNextStepRecord = Pick<
  ShippedOrder,
  | 'shipment_id'
  | 'packed_at'
  | 'ship_confirmed_at'
  | 'is_out_of_stock'
  | 'latest_status_category'
  | 'is_terminal'
  | 'has_exception'
> & {
  has_tech_scan?: boolean | null;
  pack_activity_at?: string | null;
};

/**
 * The arrow is the whole grammar of this line: it is not another status, it is
 * the direction of travel. One glyph, so a 10rem track spends its width on the
 * station name rather than on the word "next".
 */
const HEADED = '→';

/**
 * After leave-the-building, the second line is the next *carrier* word —
 * EasyPost / AfterShip / UPS pipeline, not a warehouse "Completed".
 */
const NEXT_BY_CARRIER: Readonly<Record<string, CompoundNextStep>> = {
  LABEL_CREATED: { label: `${HEADED} In Transit`, tip: 'Next: first network scan (in transit)' },
  ACCEPTED: { label: `${HEADED} In Transit`, tip: 'Next: moving through the carrier network' },
  IN_TRANSIT: { label: `${HEADED} Out for delivery`, tip: 'Next: out for delivery' },
  OUT_FOR_DELIVERY: { label: `${HEADED} Delivered`, tip: 'Next: carrier delivery scan' },
  DELIVERED: { label: 'Delivered', done: true, tip: 'Delivered — the carrier reported it' },
  RETURNED: { label: 'Returned', done: true, tip: 'Returned to sender' },
  EXCEPTION: { label: 'Exception', blocked: true, tip: 'Carrier exception — needs a human' },
  UNKNOWN: { label: `${HEADED} In Transit`, tip: 'Waiting for the first carrier scan' },
};

/** Pre-dock stage → the station that takes it next. */
const NEXT_BY_STAGE: Readonly<
  Record<OrderLifecycleStage, { label: string; tip: string; blocked?: boolean }>
> = {
  AWAITING_LABEL: { label: 'Label', tip: 'Next: buy or attach a shipping label' },
  PENDING: { label: 'Pick', tip: 'Next: pick and test at the bench' },
  TESTED: { label: 'Pack', tip: 'Next: pack station' },
  PACKED_STAGED: { label: 'Scan out', tip: 'Next: dock scan-out' },
  // Not a station — a hold. The row moves when a human clears it, which is why
  // this is the one next-step face that carries the alert tone.
  BLOCKED: { label: 'Clear hold', tip: 'Blocked: out of stock — needs a human', blocked: true },
};

/**
 * Where this order is headed, as a face for the STATUS cell's second line.
 *
 * Post-dock wins: once a package has left the building the pre-dock stage is
 * history, and re-reading it would print "→ Scan out" under a row the dock
 * already scanned.
 */
export function ordersNextStep(record: OrdersNextStepRecord): CompoundNextStep {
  const outboundSignals = {
    packedAt: record.packed_at ?? record.pack_activity_at ?? null,
    shipConfirmedAt: record.ship_confirmed_at ?? null,
    latestStatusCategory: record.latest_status_category ?? null,
    isTerminal: record.is_terminal ?? null,
    hasException: record.has_exception ?? null,
  };

  if (hasLeftWarehouse(outboundSignals)) {
    const stage = resolveOutboundStage(outboundSignals);
    if (stage === 'DELIVERED') {
      return { label: 'Delivered', done: true, tip: 'Delivered — the carrier reported it' };
    }
    if (stage === 'EXCEPTION') {
      return { label: 'Exception', blocked: true, tip: 'Carrier exception — needs a human' };
    }
    const cat = String(record.latest_status_category ?? '').trim().toUpperCase();
    const nextCarrier = NEXT_BY_CARRIER[cat];
    if (nextCarrier) return nextCarrier;
    // Dock scan / custody with no category yet — the next network word.
    return NEXT_BY_CARRIER.LABEL_CREATED;
  }

  const next = NEXT_BY_STAGE[
    resolveOrderLifecycleStage({
      shipmentId: record.shipment_id ?? null,
      hasTechScan: record.has_tech_scan ?? null,
      packedAt: record.packed_at ?? record.pack_activity_at ?? null,
      isOutOfStock: record.is_out_of_stock ?? null,
    })
  ];

  return {
    label: `${HEADED} ${next.label}`,
    tip: next.tip,
    ...(next.blocked ? { blocked: true } : null),
  };
}
