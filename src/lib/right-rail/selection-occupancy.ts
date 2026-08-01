/**
 * Rail selection occupancy — which right-rail body a grid selection resolves to.
 *
 * On the dashboard orders grid the right rail IS the selection plane: the bottom
 * `ContextualSelectionBar` capsule is gone, and selecting rows is what mounts the
 * rail. **Cardinality decides the body** — one record inspects, two compare, more
 * stage for a batch action. That is the whole rule, and it lives here as a pure
 * function so the registrar, the shared rail shell, the specs, and the guard all
 * read one answer instead of four copies of `ids.length === 2`.
 *
 * WHY A MODULE AND NOT AN INLINE TERNARY
 * The grid carried two independent selection channels — `?openOrderId=` (row-body
 * click → inspector) and the `selection:{scope}` bus (checkbox → capsule) — which
 * could disagree: order 4821 open while six *different* rows were checked. One
 * rail cannot serve both, so the check-set became the only selection and this
 * resolver became the single place that reads it. Plan:
 * `docs/todo/order-rail-selection-plane-PLAN.md`.
 *
 * Pure and dependency-free by design (same contract as
 * `receiving/inspector/carton-inspector-model.ts`): no React, no fetch, no
 * imports, so it runs under `node --test` with zero setup.
 */

/**
 * Occupant ids for the single `RightRailHost` slot.
 *
 * **Stable per MODE, never per record.** The host keys its
 * `AnimatePresence mode="wait"` on the occupant id, so a per-record id
 * (`detail:order:4821`) turns every row→row step into a full exit-then-enter with
 * an empty slot between — ~0.8s of blank rail on the core loop of arrowing down a
 * queue. With one id per mode the occupant stays mounted and its node swaps in
 * place via the store's `updateRightRailPanelNode` path, which exists for exactly
 * this. See `.claude/rules/display/motion-crossfade.md` → the queue-processing
 * inspector exception, and D5 in the plan.
 *
 * Mode→mode IS a real crossfade (different id, entirely different body). That is
 * correct: it happens once per gesture, not once per record.
 */
export const RAIL_OCCUPANT_ID = {
  /** One record — the existing full inspector (`ShippedDetailsPanel`). */
  inspect: 'detail:order',
  /** Exactly two — the divergence-first compare pane. */
  compare: 'detail:order-compare',
  /** Three or more — the staged roster + batch actions. */
  attention: 'detail:order-batch',
} as const;

type RailOccupancyKind = keyof typeof RAIL_OCCUPANT_ID;

/** Selection size that opens the compare pane. Two columns is the pane's shape,
 *  not a tunable — a third column is the attention roster, not a wider compare. */
export const COMPARE_SELECTION_SIZE = 2;

type RailOccupancy =
  | { kind: 'none' }
  | {
      kind: 'inspect';
      occupantId: typeof RAIL_OCCUPANT_ID.inspect;
      /** Convenience for the single-record panel, which takes one id. */
      orderId: number;
      /** Uniform shape so the shared bands/actions never branch on kind. */
      orderIds: readonly [number];
    }
  | {
      kind: 'compare';
      occupantId: typeof RAIL_OCCUPANT_ID.compare;
      /** Selection order — `[0]` renders left, `[1]` right. */
      orderIds: readonly [number, number];
    }
  | {
      kind: 'attention';
      occupantId: typeof RAIL_OCCUPANT_ID.attention;
      orderIds: readonly number[];
    };

/**
 * Clean a raw selection into the ids the rail may act on: coerce, drop anything
 * that is not a real row id, and de-duplicate — **preserving first-seen order**.
 *
 * Order stability is load-bearing for compare: the bus re-broadcasts the whole
 * selection on every change (`emitSelection(scope, rows)`), so a resolver that
 * sorted, or that de-duplicated by keeping the last occurrence, would let the two
 * compare columns swap sides under the operator mid-read.
 *
 * The `Number.isFinite` filter is the same hygiene every bulk handler already
 * applies at its own call site (`.map(Number).filter(Number.isFinite)` in the
 * flag / ship-by / delete paths); doing it once here is why the rail's action
 * region does not have to repeat it four more times.
 */
export function normalizeRailSelection(
  ids: readonly (number | string | null | undefined)[],
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of ids) {
    if (raw === null || raw === undefined || raw === '') continue;
    const n = Number(raw);
    // Excludes NaN and ±Infinity. Row ids are positive integers; a 0 or negative
    // id is a sentinel from a not-yet-persisted row, never something to open.
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * The rule: selection size → rail body.
 *
 * | selected | kind |
 * |---|---|
 * | 0 | `none` — the rail does not mount |
 * | 1 | `inspect` |
 * | 2 | `compare` |
 * | 3+ | `attention` |
 *
 * Callers pass the raw selection; normalization happens here so a caller cannot
 * skip it. Safe to call on every render — pure, allocation-light, no I/O.
 */
export function resolveRailOccupancy(
  ids: readonly (number | string | null | undefined)[],
): RailOccupancy {
  const orderIds = normalizeRailSelection(ids);

  if (orderIds.length === 0) return { kind: 'none' };

  if (orderIds.length === 1) {
    return {
      kind: 'inspect',
      occupantId: RAIL_OCCUPANT_ID.inspect,
      orderId: orderIds[0]!,
      orderIds: [orderIds[0]!],
    };
  }

  if (orderIds.length === COMPARE_SELECTION_SIZE) {
    return {
      kind: 'compare',
      occupantId: RAIL_OCCUPANT_ID.compare,
      orderIds: [orderIds[0]!, orderIds[1]!],
    };
  }

  return {
    kind: 'attention',
    occupantId: RAIL_OCCUPANT_ID.attention,
    orderIds,
  };
}

/**
 * Whether a given mode's registrar should hold a claim on the slot.
 *
 * `RightRailHost` already renders only the top occupant, so two live claims would
 * not both paint — but a suppressed-yet-registered panel keeps fetching and keeps
 * its subscriptions warm. Gate each registrar's `enabled` on this so the losing
 * modes go quiet.
 */
export function isRailOccupantActive(
  occupancy: RailOccupancy,
  kind: RailOccupancyKind,
): boolean {
  return occupancy.kind === kind;
}
