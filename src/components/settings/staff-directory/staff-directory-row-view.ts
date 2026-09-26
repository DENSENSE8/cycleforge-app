/** `StaffDirectoryRow → CompoundRowView` — the staff-directory desk adapter. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import {
  staffEffectiveStatusLabel,
  type StaffDirectoryRow,
} from '@/lib/staff/staff-directory-row';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/** The Calendar-line face for a teammate who has never signed in. */
const NEVER_FACE = 'Never';

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The Calendar (secondary) line — time of day, no seconds. */
export function staffLoginClockFace(iso: string | null | undefined): string | null {
  const d = parseInstant(iso);
  return d ? format(d, 'h:mm a') : null;
}

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
function civilFace(iso: string | null | undefined): { label: string; dateKey: string } | null {
  const d = parseInstant(iso);
  return d ? { label: format(d, 'MMM d'), dateKey: format(d, 'yyyy-MM-dd') } : null;
}

/** Pill tone. A live account is confirmed; an outstanding invite and a deactivated account are both ordinary states of the directory and… */
function stateToneFor(row: StaffDirectoryRow): CompoundStateTone {
  return row.active && String(row.status ?? '').trim() === 'active' ? 'done' : 'neutral';
}

export function staffDirectoryCompoundView(row: StaffDirectoryRow): CompoundRowView {
  const name = String(row.name ?? '').trim();
  const day = civilFace(row.last_login_at);
  const clock = staffLoginClockFace(row.last_login_at);
  const stamp = day && clock ? `${day.label} · ${clock}` : (day?.label ?? clock);
  const lifecycle = String(row.status ?? '').trim();
  const pill = staffEffectiveStatusLabel(row.status, row.active);

  return {
    id: String(row.id),
    thumbUrl: null,
    // A staff row with no name is malformed; name it by the one handle it
    // definitely has rather than painting "Untitled" over a person.
    title: name || `Staff #${row.id}`,
    // The retired Name cell was ONE line. Nothing in this feed was ever
    // written under it, and inventing a second line would invent a fact.
    note: null,
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    identityFace: compoundIdentityFace(String(row.id), 'Staff id'),
    orderId: null,
    tracking: null,
    // No marketplace and no carrier behind a teammate: the identity chip must
    // not borrow a brand dot from another family's vocabulary.
    platformValue: null,
    carrier: null,
    stateLabel: pill,
    stateTone: stateToneFor(row),
    // The retired pill REPLACED the lifecycle word with `deactivated` and the
    // original was unreadable. Keep it on the hover.
    ...(!row.active && lifecycle && lifecycle !== pill
      ? { stateTip: `${pill} · was ${lifecycle}` }
      : null),
    orderedAt: day
      ? { label: day.label, tip: stamp ?? day.label, dateKey: day.dateKey }
      : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a sign-in stamp.
    ...(stamp ? { startedHover: `Last login · ${stamp}` } : null),
    // Calendar line = the clock, or the retired cell's `Never`. Not a
    // deadline: `days: 0` / not overdue is the honest answer for a desk with
    // no due dates at all.
    delay: { days: 0, overdue: false, faceLabel: clock ?? NEVER_FACE },
    delayTip: stamp ? `Last login · ${stamp}` : 'Never signed in',
    amount: null,
  };
}
