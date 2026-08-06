/**
 * Repair-queue rail selection occupancy.
 *
 * Cardinality → body (mirrors receiving / orders occupancy SoTs):
 * | selected | kind |
 * |----------|------|
 * | 0 | none |
 * | 1 | inspect — existing RepairDetailsPanel (`detail:repair`) |
 * | 2+ | attention — RepairRailShell (`detail:repair-batch`) |
 *
 * Plan: hoard History rail SoT → Wave 3 Repair.
 */

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
  const repairIds = normalizeRailSelection(ids);

  if (repairIds.length === 0) return { kind: 'none' };

  if (repairIds.length === 1) {
    return {
      kind: 'inspect',
      occupantId: REPAIR_RAIL_OCCUPANT_ID.inspect,
      repairId: repairIds[0]!,
      repairIds: [repairIds[0]!],
    };
  }

  return {
    kind: 'attention',
    occupantId: REPAIR_RAIL_OCCUPANT_ID.attention,
    repairIds,
  };
}

export function isRepairRailBatchActive(occupancy: RepairRailOccupancy): boolean {
  return occupancy.kind === 'attention';
}

export function isRepairRailInspectActive(occupancy: RepairRailOccupancy): boolean {
  return occupancy.kind === 'inspect';
}
