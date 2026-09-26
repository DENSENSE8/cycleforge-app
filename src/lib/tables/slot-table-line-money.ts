/** Line-money identity — engine law for every PRODUCT_TABLES peer. */

import {
  COMPOUND_MONEY_TONE_CLASS,
  type CompoundSubtitlePart,
} from '@/components/tables/compound/compound-row-model';
import {
  fieldAllowsSlot,
  type FieldCatalog,
  type FieldDef,
} from '@/lib/tables/field-catalog/types';
import { MAX_SUBTITLE_SLOTS, type SlotLayout } from '@/lib/tables/slot-layout-core';

/** Fields picker / toggle copy — money cannot leave the under-title lock. */
export const LINE_MONEY_LOCKED_REASON = 'Price stays under the item title' as const;

/** Empty price face — currency mark, not a generic dash. */
export const EMPTY_MONEY_FACE = '$-' as const;

const LINE_MONEY_WIDTH_CH = 8;

function isQtyFieldId(fieldId: string): boolean {
  return fieldId.endsWith('.qty') && !fieldId.endsWith('total_qty');
}

export function isLineMoneyFieldId(fieldId: string | null | undefined): boolean {
  if (!fieldId) return false;
  return fieldId.endsWith('.amount') || fieldId.endsWith('.price');
}

export function isLineMoneyField(field: FieldDef): boolean {
  return (
    isLineMoneyFieldId(field.id) &&
    field.displayType === 'money' &&
    fieldAllowsSlot(field, 'subtitle')
  );
}

/** The catalog's line-money field, or null on desks that are not priced lines. */
export function lineMoneyField(catalog: FieldCatalog): FieldDef | null {
  const hits = catalog.filter(isLineMoneyField);
  const amount = hits.find((f) => f.id.endsWith('.amount'));
  return amount ?? hits[0] ?? null;
}

/**
 * Pin `{family}.amount` / `{family}.price` as subtitle after qty. Moves it out
 * of the status band or `amountFieldId` if a product default parked it there.
 * No-op when the catalog has no line money.
 */
export function ensureLineMoneySubtitle(layout: SlotLayout, catalog: FieldCatalog): SlotLayout {
  const field = lineMoneyField(catalog);
  if (!field) return layout;
  const id = field.id;
  const qtyFirst = layout.subtitleBindings[0] && isQtyFieldId(layout.subtitleBindings[0].fieldId);
  const wantIndex = qtyFirst ? 1 : 0;
  const already =
    layout.subtitleBindings[wantIndex]?.fieldId === id &&
    !layout.statusBindings.some((b) => b.fieldId === id) &&
    layout.amountFieldId !== id;
  if (already) return layout;

  const statusBindings = layout.statusBindings.filter((b) => b.fieldId !== id);
  const rest = layout.subtitleBindings.filter((b) => b.fieldId !== id);
  const qty = rest.filter((b) => isQtyFieldId(b.fieldId));
  const other = rest.filter((b) => !isQtyFieldId(b.fieldId));
  const otherCapped = other.slice(0, MAX_SUBTITLE_SLOTS - 1 - qty.length);
  return {
    ...layout,
    statusBindings,
    subtitleBindings: [...qty, { fieldId: id }, ...otherCapped],
    amountFieldId: layout.amountFieldId === id ? null : layout.amountFieldId,
  };
}

/** Binding order: qty, then money, then the rest. */
export function pinLineMoneySubtitleBindings(layout: SlotLayout): SlotLayout {
  const money = layout.subtitleBindings.find((b) => isLineMoneyFieldId(b.fieldId));
  if (!money) return layout;
  const qty = layout.subtitleBindings.filter((b) => isQtyFieldId(b.fieldId));
  const rest = layout.subtitleBindings.filter(
    (b) => b.fieldId !== money.fieldId && !isQtyFieldId(b.fieldId),
  );
  const next = [...qty, money, ...rest];
  if (
    next.length === layout.subtitleBindings.length &&
    next.every((b, i) => b.fieldId === layout.subtitleBindings[i]?.fieldId)
  ) {
    return layout;
  }
  return { ...layout, subtitleBindings: next };
}

/** Display order: money sits immediately after qty. */
export function pinLineMoneyAfterQty(
  parts: readonly CompoundSubtitlePart[],
): CompoundSubtitlePart[] {
  const qty: CompoundSubtitlePart[] = [];
  const money: CompoundSubtitlePart[] = [];
  const rest: CompoundSubtitlePart[] = [];
  for (const part of parts) {
    if (part.key && isQtyFieldId(part.key)) qty.push(part);
    else if (part.key && isLineMoneyFieldId(part.key)) money.push(part);
    else rest.push(part);
  }
  return money.length > 0 ? [...qty, ...money, ...rest] : [...parts];
}

/** To-ship / Unbox money FACE — green tabular, 8ch, `$-` when empty. */
export function lineMoneySubtitlePart(fieldId: string, text: string | null | undefined): CompoundSubtitlePart {
  const face = String(text ?? '').trim() || EMPTY_MONEY_FACE;
  return {
    text: face,
    toneClass: COMPOUND_MONEY_TONE_CLASS,
    key: fieldId,
    widthCh: LINE_MONEY_WIDTH_CH,
  };
}
