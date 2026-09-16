/**
 * Staff-directory slot resolvers — pure. One function is the WHOLE vocabulary
 * the engine reads: the slot cells, the header-sort comparator and the search
 * index all go through it, so a fact can never be searchable as one string and
 * sortable as another.
 *
 * Three rules this family leans on:
 *
 * - The teammate resolves to a PERSON value, not a name string. The face
 *   (`StaffAvatar`) is what carries the staffer's colour and photo, which is
 *   how the retired `color_hex` dot survives without a colour column.
 * - A BOOLEAN's negative case is a CLAIM, never absence: `No PIN`,
 *   `Not required`, `Inactive`. The retired cells said two of these with an
 *   em-dash and a checkbox, which a reader cannot scan and a comparator cannot
 *   order. (Same ruling as `part-compatibility.oem`.)
 * - `last_login` resolves to the ABSOLUTE INSTANT, never to the
 *   `toLocaleString` face the retired `fmtLogin` printed: `compareGridValues`
 *   needs the instant to order by, and the compact civil face is the row
 *   adapter's job. `Never` is likewise a FACE, not a stored fact — a row with
 *   no login resolves to null text so it sorts as missing.
 */

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
