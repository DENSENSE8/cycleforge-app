/** Staff-directory slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import {
  staffAuthMethod,
  STAFF_AUTH_METHOD_LABEL,
  type StaffDirectoryRow,
} from '@/lib/staff/staff-directory-row';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function resolveStaffDirectorySlotValue(
  row: StaffDirectoryRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'staff-directory.staff_id':
      return { kind: 'value', text: str(row.id) };
    case 'staff-directory.staff':
      return { kind: 'person', staffId: row.id ?? null, name: str(row.name) };
    case 'staff-directory.role':
      return { kind: 'value', text: str(row.role) };
    case 'staff-directory.status':
      // The RAW lifecycle word. The pill's `deactivated` override is the
      // adapter's derivation, so a column of `status` still says what the
      // account's lifecycle is rather than hiding it behind `active`.
      return { kind: 'value', text: str(row.status) };
    case 'staff-directory.active':
      return { kind: 'value', text: row.active ? 'Active' : 'Inactive' };
    case 'staff-directory.has_pin':
      return { kind: 'value', text: row.has_pin ? 'Set' : 'No PIN' };
    case 'staff-directory.auth_method':
      return { kind: 'value', text: STAFF_AUTH_METHOD_LABEL[staffAuthMethod(row.auth_method)] };
    case 'staff-directory.requires_sensitive_stepup':
      return { kind: 'value', text: row.requires_sensitive_stepup ? 'Required' : 'Not required' };
    case 'staff-directory.last_login':
      return { kind: 'value', text: str(row.last_login_at) };
    default:
      return null;
  }
}
