/**
 * `UnitTsnLinkTableRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * The family's ONLY contribution to how a v1 TSN record paints. Every fact it
 * does not name here is a bound SLOT resolved through
 * `unit-tsn-links-resolve.ts`.
 *
 * ## What the compound row says about a v1 record
 *
 * - IDS — the TSN id. It is the identity fact and the number an operator
 *   pastes into a v1 log query. No tracking number exists on a v1 serial
 *   record, so the cell's second line stays empty.
 * - TITLE — the STATION that wrote it. A v1 audit row has no name; where it
 *   came from is the closest thing to one, and it is what an operator joining
 *   v1 logs to v2 lifecycle actually scans for.
 * - the note line — the shipment, in words. A FALLBACK: the product layout
 *   binds `shipment` as a track, so this only shows if an org hides it.
 * - STATE — the serial TYPE, verbatim. There is no house vocabulary for v1
 *   serial types and inventing one would put a word on the pill that does not
 *   appear in the v1 table an operator is cross-referencing.
 * - DATES — Hash line = when v1 wrote the record. A v1 audit row has no
 *   deadline and no second stamp, so the Calendar line stays empty.
 */

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
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
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
