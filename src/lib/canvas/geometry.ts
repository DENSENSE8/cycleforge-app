/**
 * Canvas geometry — the N-pane constraint solver.
 *
 * Pure, DOM-free, React-free, and dependency-free on purpose: this is the one
 * module the whole tiling canvas rests on, so it has to be provable under
 * `npx tsx --test` before a browser is ever opened. Same ethic as
 * `order-compare-model.ts` ("dependency-light … no DOM and no React"), and the
 * same reason `resolveRightRailFrame` was worth generalizing rather than
 * rewriting: its 22 unit tests are the asset, not its shape.
 *
 * ## Why an N-pane solver and not `flex-1` with `min-w-[…]`
 *
 * CSS flex already distributes a row. What it cannot do is answer the three
 * questions this canvas has to answer *before* it paints:
 *
 * 1. **"How wide may THIS pane's sash go?"** — a drag needs a ceiling, and the
 *    ceiling is a function of what every other pane is holding. That is
 *    {@link paneCapPx}, and it is exactly the arithmetic
 *    `resolveRightRailFrame` / `stationDisplaysSashMaxPx` /
 *    `stationContextSashMaxPx` were each computing by hand
 *    (`frame − peers − floor`, floored at the pane's own min).
 * 2. **"Does this layout fit at all?"** — flex answers "no" by silently
 *    overflowing or by crushing a pane below its `min-width`. The canvas has to
 *    know, because the answer changes the layout (D4: below the fit threshold
 *    the canvas ships a single tile rather than two crushed ones).
 * 3. **"Who yields first?"** — flex has no yield ORDER. The station frame
 *    already needed one (park the left rail before parking Displays), and a
 *    canvas with N tiles needs it N times over.
 *
 * ## The two entry points
 *
 * - {@link paneCapPx} — the sash ceiling. One pane's question about the others.
 * - {@link resolvePaneRow} — the whole row at once: yield ladder, then a
 *   weighted water-fill between each pane's `[min, max]`, then integer rounding
 *   that sums back to the frame exactly (largest-remainder, so no 1px seam
 *   drifts as the operator drags).
 *
 * ## Rounding is part of the contract
 *
 * Sub-pixel widths make a splitter seam shimmer and make a native overlay's
 * `setVendorViewBounds` disagree with the DOM by a pixel that never settles.
 * The solver therefore returns integers whose sum is the content width exactly.
 */

/** A pane's declared demands on one axis. Widths here; heights are the same math. */
export interface PaneConstraint {
  /** Stable identity — the caller's own key (a group id, a rail name). */
  readonly key: string;
  /** Hard floor. Never crushed below this; the row degrades instead. */
  readonly minPx: number;
  /** Optional hard ceiling. Absent = unbounded (the elastic absorber). */
  readonly maxPx?: number;
  /**
   * Share of the CONTENT width, relative to its siblings. Default `1`.
   *
   * A split's ratio enters here as `[ratio, 1 - ratio]`, and the solver
   * distributes the whole content by weight *before* clamping — not the surplus
   * above the floors. That distinction is the difference between a sash that
   * sits where the operator dropped it and one that drifts: sharing only the
   * surplus makes a 0.7 ratio land at 0.6 whenever the floors are unequal, so
   * the seam and the stored ratio permanently disagree.
   */
  readonly weight?: number;
  /**
   * What this pane costs when it YIELDS instead of holding its `minPx` — the
   * parked strip width. Absent = this pane cannot park, so the row degrades
   * around it. Mirrors `CONTEXT_RAIL_PARKED_PX` (32) in the station frame.
   */
  readonly parkedPx?: number;
  /**
   * Yield order when the frame cannot seat every `minPx`. **Lower parks first.**
   * Ties break by declaration order, so the row's own left-to-right sequence is
   * the tiebreak an operator can predict. Default `0`.
   */
  readonly yieldRank?: number;
}

export interface PaneAllocation {
  readonly key: string;
  /** Integer px on the axis. */
  readonly px: number;
  /** Integer px from the row's leading edge, gutters included. */
  readonly offsetPx: number;
  /** This pane yielded to its parked strip rather than holding `minPx`. */
  readonly parked: boolean;
  /**
   * Pinned at a bound (`minPx`, `maxPx`, or parked) — i.e. it absorbed nothing
   * and a sash pushing further has to take width from someone else. This is the
   * signal `edgeDragArmState` turns into the "arm-to-close" seam highlight.
   */
  readonly constrained: boolean;
}

export interface PaneRowSolution {
  readonly panes: readonly PaneAllocation[];
  /** Every pane got at least its floor (or its parked strip). */
  readonly fits: boolean;
  /** Panes that yielded to their parked strip, in the order they yielded. */
  readonly parkedKeys: readonly string[];
  /**
   * Px still missing after the yield ladder ran out of volunteers. `0` when it
   * fits. A caller that gets a non-zero shortfall must change the LAYOUT (drop
   * to a single tile), not shrink the panes — that is D4's whole point.
   */
  readonly shortfallPx: number;
  /** Frame minus every gutter — what the panes actually divide. */
  readonly contentPx: number;
}

/** Non-finite / negative inputs read as `0` rather than poisoning the arithmetic. */
function px(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * The widest ONE pane may reach beside everything else the row is holding:
 * `frame − Σ reserved − gutters`, floored at the pane's own minimum.
 *
 * This is the single arithmetic behind all three of the right rail's hand-rolled
 * caps (`resolveRightRailFrame`'s `capPx`, `stationDisplaysSashMaxPx`,
 * `stationContextSashMaxPx`), which is why generalizing it costs nothing and
 * keeps their 22 tests green unchanged.
 *
 * `reservedPx` is what the OTHER panes hold — and the caller chooses whether
 * that is each peer's MIN (a loose cap: "you may grow until they are at their
 * floor") or each peer's ACTUAL width (a tight cap: "you may grow into the
 * leftover only"). That choice is the entire station cascade, and it stays with
 * the caller because only the caller knows which sash is being dragged.
 */
export function paneCapPx(input: {
  framePx: number;
  /** The target pane's own floor — the cap never returns less than this. */
  minPx: number;
  /** What each other pane is holding. */
  reservedPx: readonly number[];
  /** Width of one gutter. Default `0` (flush planes). */
  gutterPx?: number;
  /** How many gutters the target pane's own edges cost. Default `0`. */
  gutters?: number;
}): number {
  const frame = px(input.framePx);
  const reserved = input.reservedPx.reduce<number>((sum, value) => sum + px(value), 0);
  const gutterCost = px(input.gutterPx) * Math.max(0, Math.trunc(input.gutters ?? 0));
  return Math.max(px(input.minPx), frame - reserved - gutterCost);
}

/** The narrowest frame that seats every pane at its floor, gutters included. */
export function paneRowMinFramePx(
  panes: readonly PaneConstraint[],
  gutterPx = 0,
): number {
  if (panes.length === 0) return 0;
  const mins = panes.reduce<number>((sum, pane) => sum + px(pane.minPx), 0);
  return mins + px(gutterPx) * (panes.length - 1);
}

/**
 * Largest-remainder rounding: integers that sum to `total` exactly.
 *
 * Naive `Math.round` per pane drifts by up to `n/2` px, and the drift lands on
 * the last pane as a visible seam that moves while the operator drags. Handing
 * the remainder to the largest fractional parts keeps every pane within 1px of
 * its true share and keeps the row's total pinned to the frame.
 */
function roundToSum(values: readonly number[], total: number): number[] {
  const floors = values.map((v) => Math.floor(v));
  let remainder = total - floors.reduce((sum, v) => sum + v, 0);
  const order = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  for (const entry of order) {
    if (remainder <= 0) break;
    floors[entry.i] += 1;
    remainder -= 1;
  }
  return floors;
}

/**
 * Solve one row (or column) of panes against a frame.
 *
 * Three stages, in this order, because each one's answer is the next one's
 * input:
 *
 * 1. **Yield ladder.** While the floors do not fit, park the lowest-`yieldRank`
 *    pane that has somewhere to park. This is the station frame's "park the
 *    left rail before parking Displays" rule, generalized to N panes.
 * 2. **Weighted distribution with freezing.** The content is shared by `weight`;
 *    any pane that lands outside `[minPx, maxPx]` is clamped, frozen, and the
 *    remaining content is re-shared among the rest. Bounded by `panes.length`
 *    passes, so it cannot spin. (This is CSS flexbox's resolution loop, and for
 *    the same reason flexbox uses it: it is the only order in which a floor
 *    cannot silently steal a sibling's declared share.)
 * 3. **Round.** Largest-remainder to integers summing to the content width.
 *
 * When the ladder runs out of volunteers the solution reports `fits: false` and
 * a `shortfallPx`, and every pane sits at its floor (so the row OVERFLOWS by the
 * shortfall). That is deliberate: a solver that silently crushed panes below
 * their floor would hide exactly the condition D4 says must change the layout.
 */
export function resolvePaneRow(input: {
  framePx: number;
  gutterPx?: number;
  panes: readonly PaneConstraint[];
}): PaneRowSolution {
  const panes = input.panes;
  if (panes.length === 0) {
    return { panes: [], fits: true, parkedKeys: [], shortfallPx: 0, contentPx: 0 };
  }

  const gutter = px(input.gutterPx);
  const contentPx = Math.max(0, px(input.framePx) - gutter * (panes.length - 1));

  // ── 1. Yield ladder ────────────────────────────────────────────────────────
  const parked = new Set<string>();
  const parkedKeys: string[] = [];
  const canPark = (pane: PaneConstraint): boolean =>
    pane.parkedPx !== undefined && px(pane.parkedPx) < px(pane.minPx);
  const yieldOrder = panes
    .map((pane, index) => ({ pane, index }))
    .filter(({ pane }) => canPark(pane))
    .sort((a, b) => (a.pane.yieldRank ?? 0) - (b.pane.yieldRank ?? 0) || a.index - b.index);

  const costOf = (pane: PaneConstraint): number =>
    parked.has(pane.key) ? px(pane.parkedPx) : px(pane.minPx);
  const requiredPx = (): number => panes.reduce<number>((sum, p) => sum + costOf(p), 0);

  for (const { pane } of yieldOrder) {
    if (requiredPx() <= contentPx) break;
    parked.add(pane.key);
    parkedKeys.push(pane.key);
  }

  const required = requiredPx();
  const fits = required <= contentPx;
  const shortfallPx = fits ? 0 : required - contentPx;

  // ── 2. Weighted distribution with freezing ────────────────────────────────
  const lo = panes.map(costOf);
  const hi = panes.map((pane) =>
    parked.has(pane.key)
      ? px(pane.parkedPx)
      : pane.maxPx === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(px(pane.minPx), px(pane.maxPx)),
  );
  const weights = panes.map((pane) =>
    parked.has(pane.key) ? 0 : Math.max(0, pane.weight ?? 1),
  );

  const alloc = [...lo];
  // A parked pane, or one that declared no weight, is not in the distribution
  // at all — it holds exactly its cost and the rest of the row divides what is
  // left. Freezing it up front is what keeps a `weight: 0` pane from silently
  // being handed an equal share by the fallback branch below.
  const frozen = panes.map((_, i) => weights[i] <= 0);

  for (let pass = 0; pass <= panes.length; pass += 1) {
    const frozenTotal = alloc.reduce((sum, v, i) => (frozen[i] ? sum + v : sum), 0);
    const free = panes.map((_, i) => i).filter((i) => !frozen[i]);
    if (free.length === 0) break;

    const freeWeight = free.reduce((sum, i) => sum + weights[i], 0);
    const remaining = Math.max(0, contentPx - frozenTotal);
    for (const i of free) {
      alloc[i] =
        freeWeight > 0 ? (remaining * weights[i]) / freeWeight : remaining / free.length;
    }

    let changed = false;
    for (const i of free) {
      if (alloc[i] < lo[i]) {
        alloc[i] = lo[i];
        frozen[i] = true;
        changed = true;
      } else if (alloc[i] > hi[i]) {
        alloc[i] = hi[i];
        frozen[i] = true;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // ── 3. Round, then lay out ────────────────────────────────────────────────
  const rounded = fits
    ? roundToSum(alloc, contentPx)
    : alloc.map((v) => Math.round(v));

  const out: PaneAllocation[] = [];
  let offset = 0;
  for (let i = 0; i < panes.length; i += 1) {
    const pane = panes[i];
    out.push({
      key: pane.key,
      px: rounded[i],
      offsetPx: offset,
      parked: parked.has(pane.key),
      constrained: frozen[i],
    });
    offset += rounded[i] + gutter;
  }

  return { panes: out, fits, parkedKeys, shortfallPx, contentPx };
}

/**
 * New split ratio from a sash drag, in px space so the seam tracks the pointer
 * 1:1 until a floor stops it.
 *
 * Ratio-space arithmetic (`startRatio + delta / available`) looks equivalent and
 * is not: it cannot express "the first pane is pinned at 784 and the pointer is
 * 40px past it", so the seam keeps sliding under a pane that has stopped moving
 * and the drag ends somewhere the operator did not aim. Clamping in px and
 * converting once at the end keeps the pointer and the seam on the same pixel.
 *
 * Returns `startRatio` unchanged when the row has no room to redistribute
 * (`available < firstMin + secondMin`) — at that point the LAYOUT has to change,
 * which is the host's decision, not the sash's.
 */
export function splitRatioFromDrag(input: {
  startRatio: number;
  deltaPx: number;
  availablePx: number;
  firstMinPx: number;
  secondMinPx: number;
}): number {
  const start = clampSplitRatio(input.startRatio);
  const delta = Number.isFinite(input.deltaPx) ? input.deltaPx : 0;
  return splitRatioFromFirstPx({
    firstPx: start * px(input.availablePx) + delta,
    availablePx: input.availablePx,
    firstMinPx: input.firstMinPx,
    secondMinPx: input.secondMinPx,
    fallbackRatio: start,
  });
}

/**
 * Ratio for a first pane the operator has dragged to `firstPx`, clamped so
 * neither pane crosses its floor.
 *
 * The pointer path uses this directly (a sash IS the first pane's trailing edge,
 * so `widthFromEdgeDrag` / `heightFromEdgeDrag` already produce `firstPx`); the
 * keyboard path goes through {@link splitRatioFromDrag}, which is delta-shaped
 * because a keypress is a nudge, not a position. One clamp, two entry points —
 * the arrow keys and the drag cannot stop at different places.
 */
export function splitRatioFromFirstPx(input: {
  firstPx: number;
  availablePx: number;
  firstMinPx: number;
  secondMinPx: number;
  /** Returned when the row has no room to redistribute. */
  fallbackRatio: number;
}): number {
  const available = px(input.availablePx);
  const firstMin = px(input.firstMinPx);
  const secondMin = px(input.secondMinPx);
  const fallback = clampSplitRatio(input.fallbackRatio);
  if (available <= 0 || available < firstMin + secondMin) return fallback;
  if (!Number.isFinite(input.firstPx)) return fallback;
  const clamped = Math.min(Math.max(input.firstPx, firstMin), available - secondMin);
  return clampSplitRatio(clamped / available);
}

/**
 * Ratios live in `[0.1, 0.9]`. Not taste: a `0` ratio is a pane that exists in
 * the tree, holds a tab, and paints nothing — indistinguishable from a bug from
 * the operator's side, and unrecoverable without a hotkey. Closing a pane is the
 * gesture for removing one.
 */
export const SPLIT_RATIO_MIN = 0.1;
export const SPLIT_RATIO_MAX = 0.9;

export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(SPLIT_RATIO_MAX, Math.max(SPLIT_RATIO_MIN, ratio));
}
