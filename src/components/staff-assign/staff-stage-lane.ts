/** Which active staff belong in a Pick vs Pack assign list. */

import type { StaffFunctionalRoleKey } from '@/lib/schemas/staff-functional-roles';

/** The lane a stage assign combo staffs. One lane per column — never a dual tester+packer picker. */
export type StageAssignRole = 'technician' | 'packer';

export type StageStaffLane = StageAssignRole | 'all';

/** Roster switches every Pick / Pack list offers, in paint order. */
export const STAFF_LANE_FACES: readonly StageAssignRole[] = ['technician', 'packer'];

export function staffLaneFunctionalRole(lane: StageAssignRole): StaffFunctionalRoleKey {
  return lane === 'packer' ? 'packer' : 'picker';
}

export function staffMatchesStageLane(
  member: { functionalRoles?: readonly StaffFunctionalRoleKey[] | null },
  lane: StageStaffLane,
): boolean {
  if (lane === 'all') return true;
  return (member.functionalRoles ?? []).includes(staffLaneFunctionalRole(lane));
}

/** Toggle one functional role on a roster row; the other role is untouched. */
export function withStaffLane<T extends { functionalRoles: readonly StaffFunctionalRoleKey[] }>(
  member: T,
  lane: StageAssignRole,
  enabled: boolean,
): T {
  const key = staffLaneFunctionalRole(lane);
  const rest = member.functionalRoles.filter((k) => k !== key);
  return { ...member, functionalRoles: enabled ? [...rest, key].sort() : rest };
}

export function staffLaneEmptyLabel(lane: StageStaffLane): string {
  if (lane === 'all') return 'No staff';
  if (lane === 'packer') return 'No packers';
  return 'No pickers';
}

export function staffLaneFaceLabel(lane: StageAssignRole): string {
  return lane === 'packer' ? 'Packer' : 'Picker';
}
