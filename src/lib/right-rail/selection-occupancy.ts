/** Rail selection occupancy — which right-rail body a grid selection resolves to. */

/** Occupant ids for the single `RightRailHost` slot. */
export const RAIL_OCCUPANT_ID = {
  /** One record — the existing full inspector (`ShippedDetailsPanel`). */
  inspect: 'detail:order',
  /** Exactly two — the divergence-first compare pane. */
  compare: 'detail:order-compare',
  /** Three or more — retired; resolver returns `none` (foot-strip CTAs only). */
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

/** Clean a raw selection into the ids the rail may act on: */
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

/** The rule: selection size → rail body. */
export function resolveRailOccupancy(
  ids: readonly (number | string | null | undefined)[],
): RailOccupancy {
  normalizeRailSelection(ids);
  return { kind: 'none' };
}

/** Whether a given mode's registrar should hold a claim on the slot. */
export function isRailOccupantActive(
  occupancy: RailOccupancy,
  kind: RailOccupancyKind,
): boolean {
  return occupancy.kind === kind;
}
