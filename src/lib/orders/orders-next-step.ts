/** Where an order goes NEXT — the compound STATUS cell's second line. */

import type { CompoundNextStep } from '@/components/tables/compound/compound-row-model';
import {
  hasLeftWarehouse,
  resolveOrderLifecycleStage,
  resolveOutboundStage,
  type OrderLifecycleStage,
} from '@/lib/order-lifecycle';
import { outboundSignals } from '@/lib/orders/outbound-signals';
import type { ShippedOrder } from '@/types/orders';

/** The row facts this reads. */
export type OrdersNextStepRecord = Pick<
  ShippedOrder,
  | 'shipment_id'
  | 'packed_at'
  | 'ship_confirmed_at'
  | 'is_out_of_stock'
  | 'latest_status_category'
  | 'latest_event_at'
  | 'is_terminal'
  | 'has_exception'
> & {
  has_pick_scan?: boolean | null;
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
  PENDING: { label: 'Pick', tip: 'Next: pick at the order desk' },
  PICKED: { label: 'Pack', tip: 'Next: pack station' },
  PACKED_STAGED: { label: 'Scan out', tip: 'Next: dock scan-out' },
  // Not a station — a hold. The row moves when a human clears it, which is why
  // this is the one next-step face that carries the alert tone.
  BLOCKED: { label: 'Clear hold', tip: 'Blocked: out of stock — needs a human', blocked: true },
};

/** Map an already-resolved pre-dock stage onto its next operator step. */
export function nextStepForLifecycleStage(stage: OrderLifecycleStage): CompoundNextStep {
  const next = NEXT_BY_STAGE[stage];
  return {
    label: `${HEADED} ${next.label}`,
    tip: next.tip,
    ...(next.blocked ? { blocked: true } : null),
  };
}

/** Where this order is headed, as a face for the STATUS cell's second line. */
export function ordersNextStep(
  record: OrdersNextStepRecord,
  /** Injectable clock for the stall rule — tests pin it; surfaces omit it. */
  opts: { now?: number } = {},
): CompoundNextStep {
  // One builder, so this line cannot resolve a different stage than the STATUS
  // chip above it. Hand-building the bag here dropped `stalled`, and a stalled
  // IN_TRANSIT row printed "→ Out for delivery" under a red EXCEPTION pill.
  const outboundSignalBag = outboundSignals({
    packedAt: record.packed_at ?? record.pack_activity_at ?? null,
    shipConfirmedAt: record.ship_confirmed_at ?? null,
    latestStatusCategory: record.latest_status_category ?? null,
    latestEventAt: record.latest_event_at ?? null,
    isTerminal: record.is_terminal ?? null,
    hasException: record.has_exception ?? null,
    now: opts.now,
  });
  if (hasLeftWarehouse(outboundSignalBag)) {
    const stage = resolveOutboundStage(outboundSignalBag);
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

  return nextStepForLifecycleStage(
    resolveOrderLifecycleStage({
      shipmentId: record.shipment_id ?? null,
      hasPickScan: record.has_pick_scan ?? null,
      packedAt: record.packed_at ?? record.pack_activity_at ?? null,
      isOutOfStock: record.is_out_of_stock ?? null,
    }),
  );
}
