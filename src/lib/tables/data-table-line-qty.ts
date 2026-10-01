/** Line-qty identity — engine law for every PRODUCT_TABLES peer. */

import type { CompoundSlotValue, CompoundSubtitlePart } from '@/components/tables/compound/compound-row-model';
import { orderRowQtyTone } from '@/lib/condition-tone';
import {
  isLineMoneyFieldId,
  lineMoneySubtitlePart,
  pinLineMoneyAfterQty,
} from '@/lib/tables/data-table-line-money';

export function isLineQtyFieldId(fieldId: string | null | undefined): boolean {
  if (!fieldId) return false;
  return fieldId.endsWith('.qty') && !fieldId.endsWith('total_qty');
}


/** Display order: qty is always the left-most under-title part. */
export function pinLineQtyFirst(
  parts: readonly CompoundSubtitlePart[],
): CompoundSubtitlePart[] {
  const qty: CompoundSubtitlePart[] = [];
  const rest: CompoundSubtitlePart[] = [];
  for (const part of parts) {
    if (isLineQtyFieldId(part.key)) qty.push(part);
    else rest.push(part);
  }
  return qty.length > 0 ? [...qty, ...rest] : [...parts];
}

/**
 * What a line qty MEANS on this surface, which is what decides its tone.
 * every value (operator 2026-09-15, Inventory › Stock: the qty must not paint
 */
export type LineQtyMeaning = 'order-line' | 'on-hand';

/**
 * Line qty FACE — bare number, two-character reservation. Tone follows
 * {@link LineQtyMeaning}: an order line warns above one, an on-hand count
 * never does.
 */
export function lineQtySubtitlePart(
  fieldId: string,
  text: string,
  meaning: LineQtyMeaning = 'order-line',
): CompoundSubtitlePart {
  const qty = Number(text);
  const countTone =
    meaning === 'on-hand'
      ? 'text-text-muted'
      : orderRowQtyTone(Number.isFinite(qty) ? qty : 1);
  return {
    text,
    toneClass:
      countTone === 'text-text-muted'
        ? 'font-semibold text-text-default'
        : `font-semibold ${countTone}`,
    key: fieldId,
    widthCh: 2,
  };
}

type DataTableValueResolver = (fieldId: string) => CompoundSlotValue | null;

/**
 * Bound subtitle facts → Item-cell parts, qty then money pinned.
 *
 * `lineQtyMeaning` defaults to `order-line`, so every outbound peer keeps the
 * face it has; an inventory surface passes `on-hand`.
 */
export function dataTableSubtitlePartsFor(
  fieldIds: readonly string[],
  resolve: DataTableValueResolver,
  lineQtyMeaning: LineQtyMeaning = 'order-line',
): CompoundSubtitlePart[] {
  const parts: CompoundSubtitlePart[] = [];
  for (const fieldId of fieldIds) {
    if (isLineMoneyFieldId(fieldId)) {
      const value = resolve(fieldId);
      const text = value?.kind === 'value' ? value.text : null;
      parts.push(lineMoneySubtitlePart(fieldId, text));
      continue;
    }
    const value = resolve(fieldId);
    if (!value || value.kind !== 'value' || !value.text) continue;
    if (isLineQtyFieldId(fieldId)) {
      parts.push(lineQtySubtitlePart(fieldId, value.text, lineQtyMeaning));
      continue;
    }
    parts.push({ text: value.text, key: fieldId });
  }
  return pinLineMoneyAfterQty(pinLineQtyFirst(parts));
}
