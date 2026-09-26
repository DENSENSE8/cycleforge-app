/**
 * Receiving-line rail selection occupancy.
 *
 * Same rule as `selection-occupancy.ts` (orders): slot-table selection stays on
 * the table. Incoming 1-check / Unbox History batch no longer claim
 * `RightRailHost`. Record open is dblclick / Enter / left-click triage, not
 * checkbox cardinality.
 *
 * Reuses `normalizeRailSelection` so id hygiene stays one place. The batch
 * occupant id stays reserved so old registrars do not invent another. A picked
 * row's record opens on its ledger's `DeskRecordPlane`, never on this rail.
 */

import { normalizeRailSelection } from '@/lib/right-rail/selection-occupancy';

export const RECEIVING_RAIL_OCCUPANT_ID = {
  /** Unbox/History 2+ checks, or Incoming 2+. */
  attention: 'detail:receiving-line-batch',
} as const;

export type ReceivingRailSurface = 'incoming' | 'lines';

type ReceivingRailOccupancy =
  | { kind: 'none' }
  | {
      kind: 'attention';
      occupantId: typeof RECEIVING_RAIL_OCCUPANT_ID.attention;
      lineIds: readonly number[];
    };

/**
 * | surface   | selected | kind |
 * |-----------|----------|------|
 * | either    | any      | none |
 *
 * Record open is dblclick / Enter (Incoming) or History left-click triage —
 * not a check-set. The batch shell never claims the slot.
 */
export function resolveReceivingRailOccupancy(
  ids: readonly (number | string | null | undefined)[],
  _surface: ReceivingRailSurface,
): ReceivingRailOccupancy {
  normalizeRailSelection(ids);
  return { kind: 'none' };
}

export function isReceivingRailBatchActive(
  occupancy: ReceivingRailOccupancy,
): boolean {
  return occupancy.kind === 'attention';
}
