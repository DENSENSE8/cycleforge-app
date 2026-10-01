/** `UnitAllocationTableRow → CompoundRowView` — pure, strings and enums, no JSX. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { UnitAllocationTableRow } from '@/lib/inventory/unit-allocation-row';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';

/** Allocation state → lifecycle tone. */
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

/** Compact civil face for the Dates lines — no year (DataTable date law). */
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
    stateLabel: sentenceCaseLabel(state),
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
    /** The Calendar line is the RELEASE face, not a deadline: */
    delay: released
      ? { days: 0, overdue: false, faceLabel: `Released ${released.label}` }
      : null,
    delayTip: released ? `Released ${released.label}` : undefined,
    amount: null,
  };
}
