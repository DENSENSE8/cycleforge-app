/**
 * Active-sessions slot resolvers — pure; no clock reads. Dates resolve to the
 * ABSOLUTE instant and the engine's `date` face turns it into an age
 * (`compound-slot-face.ts`), which is what the retired `fmtRelative` helper did
 * by hand on every row.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { AuthSessionRow } from '@/lib/auth/auth-session-row';

function str(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function resolveAuthSessionsSlotValue(
  row: AuthSessionRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'auth-sessions.sid':
      return { kind: 'value', text: str(row.sid) };
    case 'auth-sessions.staff':
      return { kind: 'value', text: str(row.staff_name) ?? `#${row.staff_id}` };
    case 'auth-sessions.device_kind':
      return { kind: 'value', text: str(row.device_kind) };
    case 'auth-sessions.device_label':
      return { kind: 'value', text: str(row.device_label) };
    case 'auth-sessions.ip':
      return { kind: 'value', text: str(row.ip) };
    case 'auth-sessions.last_seen':
      return { kind: 'value', text: str(row.last_seen_at) };
    case 'auth-sessions.created':
      return { kind: 'value', text: str(row.created_at) };
    case 'auth-sessions.expires':
      return { kind: 'value', text: str(row.expires_at) };
    default:
      return null;
  }
}
