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
 * states claim slate / yellow / teal / red; `PACKED_STAGED` is the shared packed
 * purple (LIFECYCLE.packed → fulfillment);
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

/** What a To-ship LANE tab counts. `pending` is the Pending tab, which shows
 *  BLOCKED rows too (the grid only hides `TESTED`), so it is PENDING + BLOCKED. */
export interface FulfillmentLaneTotals {
  pending: number;
  tested: number;
  blocked: number;
}

/**
 * Lane totals for the To-ship tabs / filter strip / "Showing X of Y".
 *
 * **The tab number must be countable off the rows the tab shows.** The Pending
 * grid hides only `TESTED`, so its total is `PENDING + BLOCKED` — both taken
 * from the SAME lane mapping the rows use ({@link fulfillmentCountsFromCombos}
 * → {@link deriveFulfillmentState}).
 *
 * Three call sites each hand-rolled this and each got it wrong the same way
 * (fixed 2026-08-20). The shape was:
 *
 * ```ts
 * (fromCombos.PENDING || byStage.pending || 0) + fromCombos.BLOCKED   // ✗
 * ```
 *
 * `byStage` is the RAW `hasTechScan` split, and `resolveFulfillmentLane` puts
 * `isOutOfStock` FIRST — so an untested blocked order sits in `byStage.pending`
 * *and* in `BLOCKED`. Two ways that misreports:
 *
 * - `??`/unconditional form: every untested blocked order is counted twice.
 * - `||` form: worse and sneakier, because a legitimate **zero** is falsy. With
 *   0 truly-pending and 1 blocked order it fell through to `byStage.pending`
 *   (=1, the blocked one) and added `BLOCKED` (=1) — the tab read **2** over a
 *   grid holding **1 row**.
 *
 * `byStage` is therefore only a fallback for a payload carrying NO combos at
 * all (degraded route / older cache entry), and in that case blocked is not
 * added: the raw pending bucket already contains it, and the raw split cannot
 * separate the lanes anyway.
 */
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

// Presentation now flows from the one label registry (`src/lib/labels`) — the
// label/description/tone are seeded defaults there and are tenant‑overridable
// (Phase 2). The no‑two‑dots‑share‑a‑hue invariant + the PACKED_STAGED seam
// (shared packed purple with outbound) are preserved by the registry's distinct tones;
// `labels/resolve.test.ts` pins this map byte‑identical to the former literals.
export const UNSHIPPED_STATE_META = buildStateMeta('unshipped') as Record<UnshippedState, UnshippedStateMeta>;

/** Legend meta for Dashboard · Unshipped only (PENDING / TESTED / BLOCKED). */
export const FULFILLMENT_STATE_META: Record<FulfillmentState, UnshippedStateMeta> = {
  PENDING: UNSHIPPED_STATE_META.PENDING,
  TESTED: UNSHIPPED_STATE_META.TESTED,
  BLOCKED: UNSHIPPED_STATE_META.BLOCKED,
};
