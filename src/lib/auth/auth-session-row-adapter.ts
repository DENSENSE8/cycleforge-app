/**
 * `AuthSessionRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * TITLE is the staffer (who is signed in), the note line is the device, IDS is
 * the session id (the identity fact, so on a compound row it is the
 * `fulfillment` track), and STATE is the device kind.
 */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { AuthSessionRow } from '@/lib/auth/auth-session-row';

function str(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

/** An expired session is the one an admin is looking for. */
function toneFor(expiresAt: string): CompoundStateTone {
  const at = new Date(expiresAt).getTime();
  if (Number.isNaN(at)) return 'neutral';
  return at < Date.now() ? 'alert' : 'neutral';
}

export function authSessionCompoundView(row: AuthSessionRow): CompoundRowView {
  return {
    id: row.sid,
    thumbUrl: null,
    title: str(row.staff_name) ?? `Staff #${row.staff_id}`,
    note: str(row.device_label) ?? str(row.device_kind),
    orderId: str(row.sid),
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: str(row.device_kind) ?? 'session',
    stateTone: toneFor(row.expires_at),
    stateTip: str(row.ip) ?? undefined,
    delay: null,
    amount: null,
  };
}
