/**
 * Unshipped (pre‑dock) package state — shared derivation helpers for the full
 * sold → label → test → pack → dock pipeline.
 *
 * **Surface ownership (2026-06):**
 * - `AWAITING_LABEL` → Shipping · Labels (`/shipping`)
 * - `PENDING` / `TESTED` / `BLOCKED` → Dashboard · Unshipped (`deriveFulfillmentState`)
 * - `PACKED_STAGED` → Outbound · Scan-out; seam color shared with `outbound-state.ts`
 * - Post-dock states → `outbound-state.ts` on Dashboard · Shipped
 *
 * This is the inbound mirror of {@link OUTBOUND_STATE_META} in `outbound-state.ts`.
 * The two models meet at ONE shared seam state, `PACKED_STAGED`: it is the
 * terminal unshipped state AND the initial outbound state, so the dock scan‑out
 * is exactly the `PACKED_STAGED → SCANNED_OUT` transition that hands a package
 * from this model to the outbound one. To guarantee the seam never drifts, the
 * `PACKED_STAGED` dot/pill colors here are re‑used from the outbound meta.
 *
 * Color rule: no two status dots across BOTH models share a hue. The unshipped
 * states claim slate / yellow / teal / red; `PACKED_STAGED` is the shared amber;
 * the outbound states own blue / indigo / emerald / rose / orange / pink.
 *
 * Pure + isomorphic (no React, no DOM, no Date.now): safe on client and server.
 * "Late" is a deadline overlay, not a pipeline stage — see {@link isUnshippedLate}.
 */

import { buildStateMeta } from '@/lib/labels/resolve';
import {
  resolveFulfillmentLane,
  type OrderLifecycleStage,
  type FulfillmentLane,
  type OrderLifecycleSignals,
} from '@/lib/order-lifecycle';

/**
 * Pre‑dock pipeline state. The canonical vocabulary + derivation now live in
 * `order-lifecycle.ts` (the single projection per W2 of the engine‑migration
 * plan); these are re‑exported here so existing importers and the
 * `*_STATE_META` color maps below keep their stable import path. Color/label
 * presentation stays in this module.
 */
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

interface UnshippedStateMeta {
  label: string;
  /** One‑line plain‑English meaning — surfaced as the hover tooltip on dots + legend chips. */
  description: string;
  /** Tailwind classes for a compact pill (bg + text + ring). */
  pill: string;
  /** Tailwind bg class for a status dot. */
  dot: string;
}

// Presentation now flows from the one label registry (`src/lib/labels`) — the
// label/description/tone are seeded defaults there and are tenant‑overridable
// (Phase 2). The no‑two‑dots‑share‑a‑hue invariant + the PACKED_STAGED seam
// (shared amber with outbound) are preserved by the registry's distinct tones;
// `labels/resolve.test.ts` pins this map byte‑identical to the former literals.
export const UNSHIPPED_STATE_META = buildStateMeta('unshipped') as Record<UnshippedState, UnshippedStateMeta>;

/** Legend meta for Dashboard · Unshipped only (PENDING / TESTED / BLOCKED). */
export const FULFILLMENT_STATE_META: Record<FulfillmentState, UnshippedStateMeta> = {
  PENDING: UNSHIPPED_STATE_META.PENDING,
  TESTED: UNSHIPPED_STATE_META.TESTED,
  BLOCKED: UNSHIPPED_STATE_META.BLOCKED,
};
