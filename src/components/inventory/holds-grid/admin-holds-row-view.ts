/**
 * `HeldUnitRow → CompoundRowView` — the Holds desk adapter.
 *
 * Pure, strings and enums, no JSX: "the moment a family can pass a node, the
 * fork walks back in wearing a view model." Every fact not named here is a
 * bound SLOT resolved through `admin-holds-resolve.ts`.
 *
 * ## What the compound row says about one quarantined unit
 *
 * - TITLE — the SERIAL. The retired `unit` cell stacked `#{id} · {serial}`
 *   under one header; the serial is what is printed on the thing sitting in the
 *   bin, so it is the line an operator matches against.
 * - IDS — the unit ID, the row's handle and the key of the record plane
 *   (`/inventory?unit=<id>`). No tracking line: a held unit has no
 *   carrier, and inventing one would paint a chip over a fact this feed does
 *   not have. The `#` the retired cell prefixed was cell decoration — the ID
 *   face already reads as a handle.
 * - STATE — where a RELEASE puts the unit back, not `ON_HOLD`. Every row on
 *   this feed is on hold (it is the `WHERE` clause), so that word would be a
 *   column of one constant; the restore target is the fact that varies and the
 *   one an operator needs before releasing. The hover says so in words, so the
 *   pill `STOCKED` cannot be read as "this unit is in stock".
 * - DATES — the hold stamp, on BOTH lines: the civil day on the Hash line and
 *   the clock face on the Calendar line. The retired cell printed
 *   `toLocaleString()`, i.e. date AND time, and on a quarantine queue the time
 *   is the fact — a unit held twenty minutes ago is a different story from one
 *   held last Tuesday. The precise instant (seconds included, which is all
 *   `toLocaleString()`'s default ever added) stays on both hovers.
 *
 * There is no money, no photo and no deadline on a held unit; all three stay
 * null and the shared cells paint the honest empty face.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { holdRestoreStatus, type HeldUnitRow } from '@/lib/inventory/held-unit-row';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/**
 * A held unit IS work waiting on a human — that is what quarantine means, and
 * the desk's one verb (Release) is the human. Constant across the feed on
 * purpose: the alert is the hold, not the restore target the pill spells.
 * Deliberately not a colour; which hue `alert` wears is the cell's decision.
 */
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

/**
 * The Calendar (secondary) line of the DATES cell — time of day.
 *
 * Exported because it IS half of what the retired `toLocaleString()` cell
 * printed and the test pins it: a face that quietly dropped the clock would
 * read as a formatting choice rather than as the regression it is.
 */
export function holdClockFace(iso: string | null | undefined): string | null {
  const d = parseInstant(iso);
  return d ? format(d, 'h:mm a') : null;
}

/** The full instant, for the two hovers — the precision `toLocaleString()` had. */
export function holdStampTip(iso: string | null | undefined): string | null {
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
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
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
