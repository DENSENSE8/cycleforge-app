/** `SkuBinTableRow → CompoundRowView` — pure, strings and enums, no JSX. */

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
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
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
