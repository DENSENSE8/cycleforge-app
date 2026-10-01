/** `AuthSessionTableRow → CompoundRowView` — pure, strings and enums, no JSX. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { AuthSessionTableRow } from '@/lib/auth/auth-session-row';
import { AUTHSESSIONS_HANDLE_CHARS } from '@/lib/tables/field-catalog/auth-sessions';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/** Minutes of silence before a session reads as idle rather than live. */
const IDLE_AFTER_MINUTES = 30;

/** Enum → operator word. An unknown kind paints itself rather than dashing. */
const DEVICE_KIND_LABEL: Readonly<Record<string, string>> = {
  web: 'Browser',
  kiosk: 'Kiosk',
  mobile: 'Mobile',
  tablet: 'Tablet',
  desktop: 'Desktop',
  api: 'API',
};

/** Compact civil face for the Dates Hash line — no year (DataTable date law). */
function civilFace(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'MMM d');
}

function dateKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'yyyy-MM-dd');
}

/**
 * The desk's `fmtRelative`, kept verbatim as a FACE (never as a stored fact).
 * `now` is injectable so the face is testable without freezing the clock.
 */
export function sessionActivityFace(
  iso: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function authSessionsCompoundView(row: AuthSessionTableRow): CompoundRowView {
  const sid = String(row.sid ?? '');
  const handle = sid.length > AUTHSESSIONS_HANDLE_CHARS
    ? sid.slice(0, AUTHSESSIONS_HANDLE_CHARS)
    : sid;
  const kind = String(row.device_kind ?? '').trim();
  const label = String(row.device_label ?? '').trim();
  const seen = civilFace(row.last_seen_at);
  const activity = sessionActivityFace(row.last_seen_at);
  const idle = Date.now() - new Date(row.last_seen_at).getTime() > IDLE_AFTER_MINUTES * 60_000;

  return {
    id: sid,
    thumbUrl: null,
    title: String(row.staff_name ?? '').trim() || `Staff #${row.staff_id}`,
    // Fallback line only — the layout binds `device_label` as the subtitle, and
    // a bound subtitle replaces this. Says what the device is when unnamed.
    note: label || (kind ? `Unnamed ${kind} session` : null),
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    identityFace: compoundIdentityFace(handle || null, 'Session'),
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    orderedAt: seen
      ? {
          label: seen,
          tip: `Last activity ${seen}`,
          dateKey: dateKey(row.last_seen_at),
        }
      : null,
    // Explicit Hash hover SoT — the family names the chip, so the engine must
    // not prefix "Start date" onto a line that already says Last activity.
    ...(seen ? { startedHover: `Last activity ${seen}` } : null),
    stateLabel: DEVICE_KIND_LABEL[kind] ?? (kind || 'Unknown device'),
    // A live session is ordinary progress; nothing here needs a human. Tone is
    // never the fact — the pill's word is.
    stateTone: 'neutral' satisfies CompoundStateTone,
    // Calendar line = how long ago, the relative face the desk always painted.
    delay: activity
      ? {
          days: 0,
          overdue: idle,
          faceLabel: activity,
        }
      : null,
    delayTip: activity ? `Last activity · ${activity}` : undefined,
    amount: null,
  };
}
