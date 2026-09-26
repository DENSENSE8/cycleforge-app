/** `HeldUnitRow → CompoundRowView` — the Holds desk adapter. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { holdRestoreStatus, type HeldUnitRow } from '@/lib/inventory/held-unit-row';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/** A held unit IS work waiting on a human — that is what quarantine means, and the desk's one verb (Release) is the human. */
const HELD_TONE: CompoundStateTone = 'alert';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The Calendar (secondary) line of the DATES cell — time of day. */
export function holdClockFace(iso: string | null | undefined): string | null {
  const d = parseInstant(iso);
  return d ? format(d, 'h:mm a') : null;
}

/** The full instant, for the two hovers — the precision `toLocaleString()` had. */
function holdStampTip(iso: string | null | undefined): string | null {
  const d = parseInstant(iso);
  return d ? format(d, 'MMM d, yyyy · h:mm:ss a') : null;
}

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
function civilFace(iso: string | null | undefined): { label: string; dateKey: string } | null {
  const d = parseInstant(iso);
  return d ? { label: format(d, 'MMM d'), dateKey: format(d, 'yyyy-MM-dd') } : null;
}

export function adminHoldsCompoundView(row: HeldUnitRow): CompoundRowView {
  const serial = str(row.serial_number);
  const restore = holdRestoreStatus(row);
  const day = civilFace(row.held_at);
  const clock = holdClockFace(row.held_at);
  const stamp = holdStampTip(row.held_at);

  return {
    id: String(row.id),
    thumbUrl: null,
    // A unit with no serial is a malformed `serial_units` row; name it by its
    // own id rather than painting "Untitled" over the one fact it has.
    title: serial ?? `Unit #${row.id}`,
    // Fallback line only — the layout binds `hold_reason` as the subtitle and a
    // bound subtitle replaces this. Says why the unit is here either way.
    note: str(row.hold_reason),
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    identityFace: compoundIdentityFace(str(row.id), 'Hold id'),
    orderId: null,
    tracking: null,
    // No marketplace and no carrier behind a quarantined unit: the identity
    // chip must not borrow a brand dot from another family's vocabulary.
    platformValue: null,
    carrier: null,
    stateLabel: restore,
    stateTone: HELD_TONE,
    // The pill's word is a DESTINATION, so the hover names it as one. Without
    // this, `STOCKED` beside a serial reads as the unit's current state.
    stateTip: row.restore_status
      ? `On hold · releases back to ${restore}`
      : `On hold · no recorded state, releases to ${restore}`,
    orderedAt: day
      ? { label: day.label, tip: stamp ?? `Held ${day.label}`, dateKey: day.dateKey }
      : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a hold stamp.
    ...(stamp ? { startedHover: `Held ${stamp}` } : null),
    // Calendar line = the clock face. Not a deadline: `days: 0` / not overdue
    // is the honest answer for a desk with no due dates at all.
    delay: clock ? { days: 0, overdue: false, faceLabel: clock } : null,
    ...(stamp ? { delayTip: `Held ${stamp}` } : null),
    amount: null,
  };
}
