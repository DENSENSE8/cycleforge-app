/** Unshipped (pre‑dock) package state — shared derivation helpers for the full sold → label → test → pack → dock pipeline. */

import { buildStateMeta } from '@/lib/labels/resolve';
import {
  resolveFulfillmentLane,
  type OrderLifecycleStage,
  type FulfillmentLane,
  type OrderLifecycleSignals,
} from '@/lib/order-lifecycle';

/** Pre‑dock pipeline state. */
type UnshippedState = OrderLifecycleStage;
/** Pre-pack fulfillment lanes shown on Dashboard · Unshipped (excludes label + dock). */
export type FulfillmentState = FulfillmentLane;
type UnshippedStateInput = OrderLifecycleSignals;

/** Derive fulfillment-queue lane for orders that already have a label/tracking. */
export function deriveFulfillmentState(input: UnshippedStateInput): FulfillmentState {
  return resolveFulfillmentLane(input);
}

type FulfillmentCounts = Record<FulfillmentState, number>;

export const ZERO_FULFILLMENT_COUNTS: FulfillmentCounts = {
  PENDING: 0,
  TESTED: 0,
  BLOCKED: 0,
};

/**
 * Map `/api/orders/queue-counts` raw combos → PENDING/TESTED/BLOCKED tallies.
 * SQL only returns signal facts (`hasTechScan` × `blocked`); lane SoT stays
 * {@link deriveFulfillmentState} (Decision 8) so the sidebar never re-implements it.
 */
export function fulfillmentCountsFromCombos(
  combos: ReadonlyArray<{ hasTechScan: boolean; blocked: boolean; count: number }>,
): FulfillmentCounts {
  const counts: FulfillmentCounts = { ...ZERO_FULFILLMENT_COUNTS };
  for (const c of combos) {
    const state = deriveFulfillmentState({
      hasTechScan: c.hasTechScan,
      isOutOfStock: c.blocked,
    });
    counts[state] += c.count;
  }
  return counts;
}

/** What a To-ship LANE tab counts. `pending` is the Pending tab, which shows
 *  BLOCKED rows too (the grid only hides `TESTED`), so it is PENDING + BLOCKED. */
export interface FulfillmentLaneTotals {
  pending: number;
  tested: number;
  blocked: number;
}

/** Lane totals for the To-ship tabs / filter strip / "Showing X of Y". */
export function fulfillmentLaneTotals(
  counts:
    | {
        combos?: ReadonlyArray<{ hasTechScan: boolean; blocked: boolean; count: number }>;
        byStage?: { pending: number; tested: number };
      }
    | null
    | undefined,
): FulfillmentLaneTotals {
  const combos = counts?.combos ?? [];
  if (combos.length > 0) {
    const c = fulfillmentCountsFromCombos(combos);
    return { pending: c.PENDING + c.BLOCKED, tested: c.TESTED, blocked: c.BLOCKED };
  }
  return {
    pending: counts?.byStage?.pending ?? 0,
    tested: counts?.byStage?.tested ?? 0,
    blocked: 0,
  };
}

interface UnshippedStateMeta {
  label: string;
  /** One‑line plain‑English meaning — surfaced as the hover tooltip on dots + legend chips. */
  description: string;
  /** Tailwind classes for a compact pill (bg + text + ring). */
  pill: string;
  /** Tailwind bg class for a status dot. */
  dot: string;
}

// Presentation now flows from the one label registry (`src/lib/labels`) — the label/description/tone are seeded defaults there and are…
export const UNSHIPPED_STATE_META = buildStateMeta('unshipped') as Record<UnshippedState, UnshippedStateMeta>;

/** Legend meta for Dashboard · Unshipped only (PENDING / TESTED / BLOCKED). */
export const FULFILLMENT_STATE_META: Record<FulfillmentState, UnshippedStateMeta> = {
  PENDING: UNSHIPPED_STATE_META.PENDING,
  TESTED: UNSHIPPED_STATE_META.TESTED,
  BLOCKED: UNSHIPPED_STATE_META.BLOCKED,
};
