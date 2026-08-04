/**
 * Receiving-line rail selection occupancy.
 *
 * Same cardinality idea as `selection-occupancy.ts` (orders), but receiving has
 * no compare pane in this wave and splits Incoming (1 → existing
 * `detail:incoming` inspector) from Unbox/History (1+ → batch shell).
 *
 * Reuses `normalizeRailSelection` so id hygiene stays one place.
 */

import { normalizeRailSelection } from '@/lib/right-rail/selection-occupancy';

export const RECEIVING_RAIL_OCCUPANT_ID = {
  /** One Incoming row — existing `IncomingDetailsPanel`. */
  inspect: 'detail:incoming',
  /** Unbox/History any non-empty set, or Incoming 2+. */
  attention: 'detail:receiving-line-batch',
} as const;

export type ReceivingRailSurface = 'incoming' | 'lines';

type ReceivingRailOccupancy =
  | { kind: 'none' }
  | {
      kind: 'inspect';
      occupantId: typeof RECEIVING_RAIL_OCCUPANT_ID.inspect;
      lineIds: readonly [number];
    }
  | {
      kind: 'attention';
      occupantId: typeof RECEIVING_RAIL_OCCUPANT_ID.attention;
      lineIds: readonly number[];
    };

/**
 * | surface   | selected | kind |
 * |-----------|----------|------|
 * | either    | 0        | none |
 * | incoming  | 1        | inspect (`detail:incoming`) |
 * | incoming  | 2+       | attention (batch shell) |
 * | lines     | 1+       | attention (batch shell) |
 */
export function resolveReceivingRailOccupancy(
  ids: readonly (number | string | null | undefined)[],
  surface: ReceivingRailSurface,
): ReceivingRailOccupancy {
  const lineIds = normalizeRailSelection(ids);

  if (lineIds.length === 0) return { kind: 'none' };

  if (surface === 'incoming' && lineIds.length === 1) {
    return {
      kind: 'inspect',
      occupantId: RECEIVING_RAIL_OCCUPANT_ID.inspect,
      lineIds: [lineIds[0]!],
    };
  }

  return {
    kind: 'attention',
    occupantId: RECEIVING_RAIL_OCCUPANT_ID.attention,
    lineIds,
  };
}

export function isReceivingRailBatchActive(
  occupancy: ReceivingRailOccupancy,
): boolean {
  return occupancy.kind === 'attention';
}
