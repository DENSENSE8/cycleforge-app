/** Repair-queue rail selection occupancy. */

import { normalizeRailSelection } from '@/lib/right-rail/selection-occupancy';

export const REPAIR_RAIL_OCCUPANT_ID = {
  /** One repair — existing `RepairDetailsPanel`. */
  inspect: 'detail:repair',
  /** Two or more — staged roster + batch actions. */
  attention: 'detail:repair-batch',
} as const;

type RepairRailOccupancy =
  | { kind: 'none' }
  | {
      kind: 'inspect';
      occupantId: typeof REPAIR_RAIL_OCCUPANT_ID.inspect;
      repairId: number;
      repairIds: readonly [number];
    }
  | {
      kind: 'attention';
      occupantId: typeof REPAIR_RAIL_OCCUPANT_ID.attention;
      repairIds: readonly number[];
    };

export function resolveRepairRailOccupancy(
  ids: readonly (number | string | null | undefined)[],
): RepairRailOccupancy {
  normalizeRailSelection(ids);
  return { kind: 'none' };
}

export function isRepairRailBatchActive(occupancy: RepairRailOccupancy): boolean {
  return occupancy.kind === 'attention';
}

export function isRepairRailInspectActive(occupancy: RepairRailOccupancy): boolean {
  return occupancy.kind === 'inspect';
}
