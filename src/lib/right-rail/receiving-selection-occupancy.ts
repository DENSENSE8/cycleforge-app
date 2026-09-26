/** Receiving-line rail selection occupancy. */

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

/** | surface | selected | kind | |-----------|----------|------| | either | any | none | */
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
