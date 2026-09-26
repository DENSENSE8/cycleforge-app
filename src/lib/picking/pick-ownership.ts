/**
 * Who a pick belongs to — the pure half of picker assignment.
 * Operator 2026-09-25: "if the product is picked by the staff then auto assign
 */

import type { PickOwner, PickStaffRef } from './directed-pick';

/** How many backups are auto-selected per order. */
export const PICK_BACKUP_COUNT = 2;

export interface PickOwnershipInput {
  assignedStaffId: number | null;
  pairedStaffId: number | null;
  /** Ranked candidates: pick history of the order's SKUs, then the picker roster. */
  backupCandidates: readonly number[];
}

export interface PickOwnership {
  owner: { staffId: number; via: PickOwner['via'] } | null;
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

/** May this picker be fed the order? Their own session always may. */
export function pickEligibleFor(
  staffId: number,
  row: { mine: boolean; heldByOther: boolean; ownership: PickOwnership },
): boolean {
  if (row.mine) return true;
  const owner = row.ownership.owner;
  // A pass or a Take hands the order over even while a stale hold lingers.
  if (owner?.staffId === staffId && owner.via === 'assigned') return true;
  if (row.heldByOther) return false;
  return owner == null || owner.staffId === staffId;
}

/**
 * Feed rank, lower first: my open session, then passed to me, then my SKU /
 * backup work, then unassigned. Ties keep the SQL's urgency order.
 */
export function pickFeedTier(staffId: number, row: { mine: boolean; ownership: PickOwnership }): number {
  if (row.mine) return 0;
  const owner = row.ownership.owner;
  if (owner?.staffId === staffId) return owner.via === 'assigned' ? 1 : 2;
  return 3;
}

export function toStaffRefs(ids: readonly number[], names: ReadonlyMap<number, string>): PickStaffRef[] {
  return ids.map((staffId) => ({ staffId, name: names.get(staffId) ?? null }));
}
