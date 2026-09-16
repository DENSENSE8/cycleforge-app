/**
 * `UnitAllocationTableRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * The family's ONLY contribution to how an allocation row paints. Every fact
 * it does not name here is a bound SLOT resolved through
 * `unit-allocations-resolve.ts`.
 *
 * ## What the compound row says about a reservation
 *
 * - IDS — the ORDER holding the unit. The identity fact, and the handle an
 *   operator matches against a pick list. There is no tracking number on a
 *   reservation, so the cell's second line stays empty rather than borrowing
 *   one from the order.
 * - TITLE — the UNIT. On the unit-detail desk that repeats the page's own
 *   subject, which is why the desk hands the unit it already knows to the
 *   rows; on the per-SKU desk it is the fact that distinguishes two
 *   allocations of the same SKU.
 * - the note line — WHY it was released. It is the FALLBACK here: the product
 *   layout binds `reason` as a subtitle, so the engine paints it and this
 *   string only shows if an org unbinds it.
 * - STATE — the allocation state, with the release stamp on the hover. The
 *   retired cell ran the word through `unitStatusBadgeClass`, a SERIAL-status
 *   palette: `ALLOCATED` collides with the unit status of the same name, but
 *   `PICKED`/`PACKED`/`SHIPPED`/`RELEASED` were colouring an allocation state
 *   against a unit-status SoT. Tone is not the fact — the word is.
 * - DATES — Hash line = when the order took the unit. There is no deadline on
 *   a reservation, so the Calendar line carries the RELEASE age when the hold
 *   has ended, which is the one other temporal fact this row has.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { UnitAllocationTableRow } from '@/lib/inventory/unit-allocation-row';

/**
 * Allocation state → lifecycle tone. `state ∈ ALLOCATED | PICKED | PACKED |
 * SHIPPED | RELEASED` (`order_unit_allocations`, drizzle schema).
 *
 * Nothing here is an ALERT: a reservation moving through the pipeline is
 * ordinary progress, and a release is a decision somebody made, not an
 * exception waiting for a human. A state nobody mapped reads `neutral` rather
 * than inventing urgency.
 */
const STATE_TONE: Readonly<Record<string, CompoundStateTone>> = {
  ALLOCATED: 'neutral',
  PICKED: 'neutral',
  PACKED: 'neutral',
  SHIPPED: 'done',
  RELEASED: 'done',
};

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** Compact civil face for the Dates lines — no year (slot-table date law). */
function civilFace(iso: string | null | undefined): { label: string; dateKey: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { label: format(d, 'MMM d'), dateKey: format(d, 'yyyy-MM-dd') };
}

export function unitAllocationsCompoundView(row: UnitAllocationTableRow): CompoundRowView {
  const state = str(row.state) ?? 'UNKNOWN';
  const unit = str(row.serial_unit_id);
  const allocated = civilFace(row.allocated_at);
  const released = civilFace(row.released_at);

  return {
    id: String(row.id),
    thumbUrl: null,
    // A feed that omits the unit (the unit-detail desk before it widens its
    // rows) still names the row by something it HAS, never "Untitled".
    title: unit ? `Unit #${unit}` : `Allocation #${row.id}`,
    note: str(row.released_reason),
    orderId: str(row.order_id),
    // A reservation has no label and no carrier — the identity dot must not
    // borrow a brand from the order it belongs to.
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: state,
    stateTone: STATE_TONE[state] ?? 'neutral',
    stateTip: released ? `Released ${released.label}` : undefined,
    orderedAt: allocated
      ? {
          label: allocated.label,
          tip: `Allocated ${allocated.label}`,
          dateKey: allocated.dateKey,
        }
      : null,
    // Explicit Hash hover SoT — the family names the chip, so the engine must
    // not prefix "Start date" onto a line that already says Allocated.
    ...(allocated ? { startedHover: `Allocated ${allocated.label}` } : null),
    /**
     * The Calendar line is the RELEASE face, not a deadline: `days: 0` and
     * `overdue: false` because a released hold is not late, it is over, and
     * `faceLabel` is the non-deadline secondary temporal face the model
     * documents for exactly this case. A hold that is still live leaves the
     * line empty rather than inventing a countdown.
     */
    delay: released
      ? { days: 0, overdue: false, faceLabel: `Released ${released.label}` }
      : null,
    delayTip: released ? `Released ${released.label}` : undefined,
    amount: null,
  };
}
