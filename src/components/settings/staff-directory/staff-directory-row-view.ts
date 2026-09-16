/**
 * `StaffDirectoryRow → CompoundRowView` — the staff-directory desk adapter.
 *
 * Pure, strings and enums, no JSX: "the moment a family can pass a node, the
 * fork walks back in wearing a view model." Every fact not named here is a
 * bound SLOT resolved through `staff-directory-resolve.ts`.
 *
 * ## What the compound row says about one teammate
 *
 * - TITLE — the NAME. The retired cell drew a colour dot before it; the title
 *   line is a string by contract, so the dot is not reproduced there. The
 *   colour lives on the `Teammate` PERSON fact instead (`StaffAvatar` resolves
 *   it from the staff identity cache), bindable into any free slot.
 * - IDS — the staff id, the handle the Role link and the Deactivate payload
 *   both named. No tracking line: a teammate has no carrier.
 * - STATE — the pill, DERIVED from two facts exactly as the retired
 *   `<StatusPill status active>` derived it: an inactive staffer reads
 *   `deactivated`. Unlike that pill, the underlying lifecycle word is not lost
 *   — it moves to the pill's hover, and it is still its own sortable fact.
 * - DATES — the last login, on BOTH lines: the civil day on the Hash line and
 *   the clock face on the Calendar line, which together are what the retired
 *   `fmtLogin` printed (`dateStyle: 'medium', timeStyle: 'short'`). A teammate
 *   who has never signed in keeps the retired cell's word, `Never`, as the
 *   Calendar face — absence is a dash, and "never signed in" is a claim.
 *
 * ## What `!active` looks like now
 *
 * The retired table DIMMED every cell of an inactive row (`!s.active &&
 * 'text-text-faint'` repeated in five cells). The engine is monomorphic, a
 * family may not paint cells, and {@link CompoundRowView} has no row-level tone
 * channel — so that affordance cannot be reproduced and is not faked. It is
 * replaced by the pill's WORD (`deactivated`) plus a bindable `Account` fact
 * (`Active` / `Inactive`) that, unlike a dim, sorts and searches.
 *
 * There is no money, no photo and no deadline on a staff row; all three stay
 * null and the shared cells paint the honest empty face.
 */

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

/**
 * The Calendar (secondary) line — time of day, no seconds.
 *
 * Exported because it IS the half of the retired `fmtLogin` face that a civil
 * day alone would drop, and the test pins it: `timeStyle: 'short'` is what the
 * desk printed, and quietly losing it would read as a formatting choice rather
 * than as the regression it is.
 */
export function staffLoginClockFace(iso: string | null | undefined): string | null {
  const d = parseInstant(iso);
  return d ? format(d, 'h:mm a') : null;
}

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
function civilFace(iso: string | null | undefined): { label: string; dateKey: string } | null {
  const d = parseInstant(iso);
  return d ? { label: format(d, 'MMM d'), dateKey: format(d, 'yyyy-MM-dd') } : null;
}

/**
 * Pill tone. A live account is confirmed; an outstanding invite and a
 * deactivated account are both ordinary states of the directory and neither is
 * work waiting on a human. The retired pill painted `invited` amber, but tone
 * here is not a colour channel — the pill's WORD is the fact.
 */
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
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
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
