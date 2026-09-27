/**
 * Order FULFILLMENT badge — one order's lines → the Shopify/Ecwid-style word the
 * To-ship index paints (research §4.2, owner 2026-09-26). Pure: no classes, no
 * React. The cell maps {@link OrderFulfillmentTone} onto the state-tone tokens.
 *
 * Urgent is NOT a fulfillment state (it is a tag chip), and late is NOT either
 * (the Fulfill by cell turns critical) — so neither input appears here.
 */

import { nonSentinelTimestamp } from '@/components/dashboard/orders-queue/helpers';
import type { ShippedOrder } from '@/types/orders';

/** Polaris badge tone — the attention ladder, not a colour. */
export type OrderFulfillmentTone = 'attention' | 'info' | 'warning' | 'critical' | 'success';

/** Polaris `progress` — which glyph the badge wears. */
export type OrderFulfillmentProgress = 'incomplete' | 'partiallyComplete' | 'complete';

export type OrderFulfillmentKey =
  | 'unfulfilled'
  | 'in_progress'
  | 'packed'
  | 'partially_packed'
  | 'on_hold_out_of_stock'
  | 'on_hold'
  | 'fulfilled';

export interface OrderFulfillmentBadge {
  key: OrderFulfillmentKey;
  /** Sentence case, past tense where Shopify uses it ("Partially packed 2/3"). */
  label: string;
  tone: OrderFulfillmentTone;
  progress: OrderFulfillmentProgress;
}

/** The line facts the mapping reads — every one is on the `/api/orders` row. */
export type OrderFulfillmentLine = Pick<
  ShippedOrder,
  | 'is_out_of_stock'
  | 'has_exception'
  | 'row_flag'
  | 'ship_confirmed_at'
  | 'is_shipped'
  | 'packed_at'
  | 'pack_activity_at'
  | 'picked_at'
  | 'test_date_time'
> & { has_pick_scan?: boolean | null };

type LineStage = 'shipped' | 'packed' | 'in_progress' | 'unfulfilled';

function lineStage(line: OrderFulfillmentLine): LineStage {
  if (nonSentinelTimestamp(line.ship_confirmed_at) || line.is_shipped === true) return 'shipped';
  if (nonSentinelTimestamp(line.packed_at) ?? nonSentinelTimestamp(line.pack_activity_at)) {
    return 'packed';
  }
  if (
    line.has_pick_scan === true ||
    nonSentinelTimestamp(line.picked_at) ||
    nonSentinelTimestamp(line.test_date_time)
  ) {
    return 'in_progress';
  }
  return 'unfulfilled';
}

/**
 * One ORDER (all its lines) → its fulfillment badge. Precedence, first match
 * wins: every line shipped → Fulfilled; any line out of stock → On hold · Out of
 * stock; any line held → On hold; every line packed → Packed; some packed →
 * Partially packed n/m; any line picked or tested → In progress; else
 * Unfulfilled. An empty order reads Unfulfilled.
 */
export function orderFulfillmentBadge(lines: readonly OrderFulfillmentLine[]): OrderFulfillmentBadge {
  const stages = lines.map(lineStage);
  const total = stages.length;
  if (total > 0 && stages.every((s) => s === 'shipped')) {
    return { key: 'fulfilled', label: 'Fulfilled', tone: 'success', progress: 'complete' };
  }
  if (lines.some((line) => line.is_out_of_stock === true)) {
    return {
      key: 'on_hold_out_of_stock',
      label: 'On hold · Out of stock',
      tone: 'critical',
      progress: 'incomplete',
    };
  }
  // Held: the operator's Hold flag, or the exceptions desk — nobody may pick or pack it yet.
  if (lines.some((line) => line.row_flag?.flag === 'hold' || line.has_exception === true)) {
    return { key: 'on_hold', label: 'On hold', tone: 'warning', progress: 'incomplete' };
  }
  // A shipped line has been packed — it counts toward the packed share.
  const packed = stages.filter((s) => s === 'packed' || s === 'shipped').length;
  if (total > 0 && packed === total) {
    return { key: 'packed', label: 'Packed', tone: 'info', progress: 'partiallyComplete' };
  }
  if (packed > 0) {
    return {
      key: 'partially_packed',
      label: `Partially packed ${packed}/${total}`,
      tone: 'info',
      progress: 'partiallyComplete',
    };
  }
  if (stages.some((s) => s === 'in_progress')) {
    return { key: 'in_progress', label: 'In progress', tone: 'info', progress: 'partiallyComplete' };
  }
  return { key: 'unfulfilled', label: 'Unfulfilled', tone: 'attention', progress: 'incomplete' };
}
