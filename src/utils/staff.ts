export const STAFF_NAMES: Record<number, string> = {
  1: 'Michael',
  2: 'Thuc',
  3: 'Sang',
  4: 'Tuan',
  5: 'Thuy',
  6: 'Cuong',
  7: 'Kai',
  8: 'Lien',
};

/** Packer staff IDs in display order. */
export const PACKER_IDS: readonly number[] = [4, 5];

/** Legacy employee ID mapping (station number → employee_id in DB). */
export const TECH_EMPLOYEE_IDS: Record<string, string> = {
  '1': 'TECH001',
  '2': 'TECH002',
  '3': 'TECH003',
  '4': 'TECH004',
};

/** Whether a staff member belongs to a role, by RBAC assignment (staff_roles) with a fallback to the legacy primary-role string. */
export function staffHasRole(
  member: { role?: string | null; roles?: readonly string[] | null },
  roleKey: string,
): boolean {
  if (Array.isArray(member.roles) && member.roles.length > 0) {
    return member.roles.includes(roleKey);
  }
  return member.role === roleKey;
}

export function getStaffName(staffId: number | null | undefined): string {
  if (!staffId) return 'Not specified';
  return STAFF_NAMES[staffId] || `Staff #${staffId}`;
}

