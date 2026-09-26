/** `RecentReturnRow → CompoundRowView` — the Returns desk adapter. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { RETURNED_STATE_LABEL } from '@/lib/tables/field-catalog/admin-returns-resolve';
import type { RecentReturnRow } from '@/lib/inventory/returns-row';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/**
 * A return that landed is DONE work — the unit is back on the floor and the
 * dock has nothing left to do with the row. Deliberately not a colour: which
 * hue `done` wears is the cell's decision.
 */
const RETURNED_TONE: CompoundStateTone = 'done';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
function civilFace(iso: string | null | undefined): { label: string; dateKey: string | null } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { label: format(d, 'MMM d'), dateKey: format(d, 'yyyy-MM-dd') };
}

export function adminReturnsCompoundView(row: RecentReturnRow): CompoundRowView {
  const sku = str(row.sku);
  const unit = str(row.serial_unit_id);
  const prev = str(row.prev_status);
  const occurred = civilFace(row.occurred_at);
  return {
    id: String(row.id),
    thumbUrl: null,
    // A row with neither SKU nor unit is a bare event; name it by its own id
    // rather than painting "Untitled" over a fact the row actually has.
    title: sku ?? (unit ? `Unit #${unit}` : `Return #${row.id}`),
    titleHref: sku ? `/inventory/health/sku/${encodeURIComponent(sku)}` : null,
    note: str(row.notes),
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    identityFace: compoundIdentityFace(unit, 'Unit'),
    orderId: null,
    tracking: str(row.scan_token),
    // No marketplace behind a return label: the identity dot detects the
    // carrier from the number itself rather than borrowing a platform.
    platformValue: null,
    carrier: null,
    stateLabel: RETURNED_STATE_LABEL,
    stateTone: RETURNED_TONE,
    stateTip: prev ? `${prev} → ${RETURNED_STATE_LABEL}` : undefined,
    // The shared Dates chrome mounts (the skeleton is never cut), so the Hash
    // line carries the stamp this row IS — when the unit came back. Leaving it
    // null would paint a column of `--` beside a bound `occurred` track.
    orderedAt: occurred
      ? { label: occurred.label, tip: `Returned ${occurred.label}`, dateKey: occurred.dateKey }
      : null,
    startedHover: occurred ? `Returned ${occurred.label}` : undefined,
    delay: null,
    amount: null,
  };
}
