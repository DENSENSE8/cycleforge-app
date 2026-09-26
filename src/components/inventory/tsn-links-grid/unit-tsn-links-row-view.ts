/** `UnitTsnLinkTableRow → CompoundRowView` — pure, strings and enums, no JSX. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { UnitTsnLinkTableRow } from '@/lib/inventory/tsn-link-row';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/**
 * A v1 record is HISTORY — it landed, and nothing on this surface can move it.
 * Deliberately not a colour: which hue `done` wears is the cell's decision.
 */
const TSN_TONE: CompoundStateTone = 'done';

/** The pill's word when a v1 row recorded no serial type at all. */
const UNTYPED_SERIAL_LABEL = 'Untyped';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
function civilFace(iso: string | null | undefined): { label: string; dateKey: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { label: format(d, 'MMM d'), dateKey: format(d, 'yyyy-MM-dd') };
}

export function unitTsnLinksCompoundView(row: UnitTsnLinkTableRow): CompoundRowView {
  const station = str(row.station_source);
  const shipment = str(row.shipment_id);
  const created = civilFace(row.created_at);

  return {
    id: String(row.id),
    thumbUrl: null,
    // A v1 row with no station is a pre-station record; name it by what it IS
    // rather than painting "Untitled" over a fact the row does not have.
    title: station ?? `TSN #${row.id}`,
    note: shipment ? `Shipment ${shipment}` : null,
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    identityFace: compoundIdentityFace(str(row.id), 'Link id'),
    orderId: null,
    tracking: null,
    platformValue: null,
    carrier: null,
    stateLabel: str(row.serial_type) ?? UNTYPED_SERIAL_LABEL,
    stateTone: TSN_TONE,
    orderedAt: created
      ? { label: created.label, tip: `Recorded ${created.label}`, dateKey: created.dateKey }
      : null,
    // Explicit Hash hover SoT — the family names the chip, so the engine must
    // not prefix "Start date" onto a line that already says Recorded.
    ...(created ? { startedHover: `Recorded ${created.label}` } : null),
    delay: null,
    amount: null,
  };
}
