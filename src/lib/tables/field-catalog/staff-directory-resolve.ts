/** Staff-directory slot resolvers — pure; dates resolve to the absolute instant. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { StaffDirectoryRow } from '@/lib/staff/staff-directory-row';

function str(v: string | number | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function resolveStaffDirectorySlotValue(
  row: StaffDirectoryRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'staff-directory.id':
      return { kind: 'value', text: str(row.id) };
    case 'staff-directory.name':
      return { kind: 'value', text: str(row.name) };
    case 'staff-directory.role':
      return { kind: 'value', text: str(row.role) };
    case 'staff-directory.status':
      return { kind: 'value', text: str(row.status) };
    case 'staff-directory.auth_method':
      return { kind: 'value', text: str(row.auth_method) };
    case 'staff-directory.last_login':
      return { kind: 'value', text: str(row.last_login_at) };
    case 'staff-directory.home':
      return { kind: 'value', text: str(row.default_home_path) };
    default:
      return null;
  }
}
