/**
 * `SkuBinTableRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * The family's ONLY contribution to how a bin row paints. Every fact it does
 * not name here is a bound SLOT resolved through `sku-bins-resolve.ts`.
 *
 * ## What the compound row says about one bin assignment
 *
 * - IDS — the BIN, `bin_name ?? bin_barcode ?? #location_id`. That is the
 *   handle a picker walks to, and it is what the retired mono cell printed.
 *   There is no tracking number on a bin, so the cell's second line stays empty
 *   rather than borrowing one.
 * - TITLE — the SKU this page is about, with the raw SKU on the note line when
 *   the catalog gave us a title to put above it. The retired table had no such
 *   column because the page heading says it once; the shared item cell asks the
 *   question per row, and the page already holds the answer.
 * - STATE — the stock LEVEL, from {@link skuBinLevel}: the same word the `bins`
 *   overview publishes, derived from this row's own qty/min/max. Tone is never
 *   the fact — `Low` and `Over` are the two words a replenisher acts on, so
 *   they carry the alert tone and the word carries the meaning.
 * - DATES — Hash line = the civil day of the last count, Calendar line = the
 *   clock. The retired cell printed `toLocaleString()` (day AND time), so
 *   dropping the time would lose a fact the desk had; putting it in the Hash
 *   tip and leaving the Calendar line `--` would hide it (the kiosk dwell
 *   rule). Seconds are not kept: a cycle count is not an audit write, where two
 *   entries a heartbeat apart are a different story (`audit-log-row-view.ts`).
 *
 * There is no money, no photo and no deadline on a bin row; all three stay null
 * and the shared cells paint the honest empty face.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { SkuBinTableRow } from '@/lib/inventory/sku-bin-row';
import {
  skuBinItemLabel,
  skuBinLabel,
  skuBinLevel,
  type SkuBinLevel,
} from '@/lib/tables/field-catalog/sku-bins-resolve';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/**
 * Level → tone. `Low` and `Over` are the two a human has to do something about
 * (replenish, spill into another bin); `Empty` is a bin this SKU has left, not
 * an exception, and `Stocked` is the ordinary case.
 */
const LEVEL_TONE: Readonly<Record<SkuBinLevel, CompoundStateTone>> = {
  Empty: 'neutral',
  Low: 'alert',
  Over: 'alert',
  Stocked: 'neutral',
};

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function skuBinsCompoundView(row: SkuBinTableRow): CompoundRowView {
  const level = skuBinLevel(row);
  const title = skuBinItemLabel(row);
  const counted = parseInstant(row.last_counted);
  const day = counted ? { label: format(counted, 'MMM d'), dateKey: format(counted, 'yyyy-MM-dd') } : null;
  const clock = counted ? format(counted, 'h:mm a') : null;
  const stamp = day && clock ? `Counted ${day.label} · ${clock}` : null;

  return {
    // A (sku, location) pair is unique per feed, so the location id IS the row
    // key — the retired table used the same `rowKey`.
    id: String(row.location_id),
    thumbUrl: null,
    title: title ?? skuBinLabel(row),
    // The raw SKU under a catalog title. When the page found no catalog row the
    // title already IS the SKU, so repeating it would be a lie by repetition.
    note: title === row.sku ? null : str(row.sku),
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
    identityFace: compoundIdentityFace(skuBinLabel(row), 'Bin'),
    orderId: null,
    tracking: null,
    // No marketplace and no carrier behind a bin: the identity chip must not
    // borrow a brand dot from another family's vocabulary.
    platformValue: null,
    carrier: null,
    stateLabel: level,
    stateTone: LEVEL_TONE[level],
    orderedAt: day ? { label: day.label, tip: stamp ?? day.label, dateKey: day.dateKey } : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a count stamp.
    ...(stamp ? { startedHover: stamp } : null),
    // Calendar line = the clock face. Not a deadline: `days: 0` / not overdue
    // is the honest answer for a desk with no due dates at all. A pair that was
    // never counted leaves the line empty rather than inventing an age.
    delay: clock ? { days: 0, overdue: false, faceLabel: clock } : null,
    delayTip: stamp ?? undefined,
    amount: null,
  };
}
