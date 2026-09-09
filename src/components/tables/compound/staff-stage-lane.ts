/**
 * Which active staff belong in a Pick vs Packed assign list.
 *
 * Floor language is picker / packer. The staff row still stores
 * `technician` for Pick (legacy column + RBAC key). A member matches if
 * any of `role` / `roles` canonicalizes into that lane. `all` is the
 * actions-column roster (every active member).
 */

import type { CompoundStageAssignRole } from './compound-row-model';

export type StageStaffLane = CompoundStageAssignRole | 'all';

const PICKER_KEYS = new Set(['technician', 'picker', 'pick', 'tech']);
const PACKER_KEYS = new Set(['packer', 'pack']);

export function staffLaneKeys(member: {
  role?: string | null;
  roles?: readonly string[] | null;
}): string[] {
  return [member.role, ...(member.roles ?? [])]
    .map((key) => String(key ?? '').trim().toLowerCase())
    .filter(Boolean);
}

export function staffMatchesStageLane(
  member: { role?: string | null; roles?: readonly string[] | null },
  lane: StageStaffLane,
): boolean {
  if (lane === 'all') return true;
  const bag = lane === 'packer' ? PACKER_KEYS : PICKER_KEYS;
  return staffLaneKeys(member).some((key) => bag.has(key));
}

export function staffLaneEmptyLabel(lane: StageStaffLane): string {
  if (lane === 'all') return 'No staff';
  if (lane === 'packer') return 'No packers';
  return 'No pickers';
}

/** Roster switches for this combo: Pick = Picker, Packed = Packer, All = both. */
export function staffLaneRosterFaces(lane: StageStaffLane): CompoundStageAssignRole[] {
  if (lane === 'all') return ['technician', 'packer'];
  return [lane === 'packer' ? 'packer' : 'technician'];
}

export function staffLaneFaceLabel(lane: CompoundStageAssignRole): string {
  return lane === 'packer' ? 'Packer' : 'Picker';
}

const FLOOR_LANE_KEYS = new Set([...PICKER_KEYS, ...PACKER_KEYS]);

/** Persist a floor lane onto a roster row without dropping unrelated roles. */
/** Floor roles are exclusive in `/api/staff` (`technician` | `packer`). */
export function oppositeStaffLane(lane: CompoundStageAssignRole): CompoundStageAssignRole {
  return lane === 'packer' ? 'technician' : 'packer';
}

export function applyStaffLaneRole<T extends { role?: string | null; roles?: readonly string[] | null }>(
  member: T,
  lane: CompoundStageAssignRole,
): T {
  const kept = (member.roles ?? []).filter((key) => {
    const lower = String(key).trim().toLowerCase();
    return lower && !FLOOR_LANE_KEYS.has(lower);
  });
  return {
    ...member,
    role: lane,
    roles: [lane, ...kept],
  };
}
