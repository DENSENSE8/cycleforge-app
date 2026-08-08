/**
 * Receiving-line rail selection occupancy.
 *
 * Same cardinality idea as `selection-occupancy.ts` (orders), but receiving has
 * no compare pane in this wave and splits Incoming (1 → existing
 * `detail:incoming` inspector) from Unbox History (1-row left-click →
 * `detail:history` triage) from batch (2+ → `detail:receiving-line-batch`).
 *
 * Reuses `normalizeRailSelection` so id hygiene stays one place.
 */

import { normalizeRailSelection } from '@/lib/right-rail/selection-occupancy';

export const RECEIVING_RAIL_OCCUPANT_ID = {
  /** One Incoming row — existing `IncomingDetailsPanel`. */
  inspect: 'detail:incoming',
  /** One Unbox History row — `HistoryCartonTriagePanel`. */
  historyInspect: 'detail:history',
  /** Unbox/History 2+ checks, or Incoming 2+. */
  attention: 'detail:receiving-line-batch',
} as const;

export type ReceivingRailSurface = 'incoming' | 'lines';

type ReceivingRailOccupancy =
  | { kind: 'none' }
  | {
      kind: 'inspect';
      occupantId:
        | typeof RECEIVING_RAIL_OCCUPANT_ID.inspect
        | typeof RECEIVING_RAIL_OCCUPANT_ID.historyInspect;
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
 * | lines     | 1        | attention (batch shell when History inspect closed;
 * |           |          | History left-click opens `detail:history` outside
 * |           |          | this helper) |
 * | lines     | 2+       | attention (batch shell) |
 *
 * Incoming 1-check must open `detail:incoming` (ReceivingDashboard wires
 * selectedRows → setIncomingDetails); the batch shell never claims Incoming 1.
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
