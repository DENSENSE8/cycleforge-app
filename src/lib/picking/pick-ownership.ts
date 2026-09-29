/**
 * Who a pick belongs to — the pure half of picker assignment.
 * Operator 2026-09-25: "if the product is picked by the staff then auto assign
 */

/** Why an order's pick belongs to a picker: a pass / Take, their SKU, or standing in for an owner who is out. */
export type PickOwnerVia = 'assigned' | 'sku' | 'backup';

/** How many backups are auto-selected per order. */
const PICK_BACKUP_COUNT = 2;

interface PickOwnershipInput {
  assignedStaffId: number | null;
  pairedStaffId: number | null;
  /** Ranked candidates: pick history of the order's SKUs, then the picker roster. */
  backupCandidates: readonly number[];
}

export interface PickOwnership {
  owner: { staffId: number; via: PickOwnerVia } | null;
  backups: number[];
}

export function resolvePickOwnership(
  input: PickOwnershipInput,
  outToday: ReadonlySet<number>,
): PickOwnership {
  const primary = input.assignedStaffId ?? input.pairedStaffId;
  const backups: number[] = [];
  for (const id of input.backupCandidates) {
    if (id === primary || backups.includes(id)) continue;
    backups.push(id);
    if (backups.length === PICK_BACKUP_COUNT) break;
  }
  if (primary == null) return { owner: null, backups };
  if (!outToday.has(primary)) {
    return { owner: { staffId: primary, via: input.assignedStaffId != null ? 'assigned' : 'sku' }, backups };
  }
  const standIn = backups.find((id) => !outToday.has(id));
  return { owner: standIn == null ? null : { staffId: standIn, via: 'backup' }, backups };
}
