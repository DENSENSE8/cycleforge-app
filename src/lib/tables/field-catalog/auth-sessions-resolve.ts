/** Auth-sessions slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { AuthSessionTableRow } from '@/lib/auth/auth-session-row';

function str(v: string | number | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function resolveAuthSessionsSlotValue(
  row: AuthSessionTableRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'auth-sessions.session':
      return { kind: 'value', text: str(row.sid) };
    case 'auth-sessions.staff': {
      // Person face: name from the staff join; never invent `Staff #id`.
      const name = str(row.staff_name);
      if (!name && row.staff_id == null) return { kind: 'person', staffId: null, name: null };
      return { kind: 'person', staffId: row.staff_id ?? null, name };
    }
    case 'auth-sessions.device_kind':
      return { kind: 'value', text: str(row.device_kind) };
    case 'auth-sessions.device_label':
      return { kind: 'value', text: str(row.device_label) };
    case 'auth-sessions.ip':
      return { kind: 'value', text: str(row.ip) };
    case 'auth-sessions.last_activity':
      return { kind: 'value', text: str(row.last_seen_at) };
    default:
      return null;
  }
}
