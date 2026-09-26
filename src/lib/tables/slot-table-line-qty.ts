/** Line-qty identity — engine law for every PRODUCT_TABLES peer. */

import type { CompoundSlotValue, CompoundSubtitlePart } from '@/components/tables/compound/compound-row-model';
import { orderRowQtyTone } from '@/lib/condition-tone';
import {
  isLineMoneyFieldId,
  lineMoneySubtitlePart,
  pinLineMoneyAfterQty,
} from '@/lib/tables/slot-table-line-money';
import {
  fieldAllowsSlot,
  type FieldCatalog,
  type FieldDef,
} from '@/lib/tables/field-catalog/types';
import { MAX_SUBTITLE_SLOTS, type SlotLayout } from '@/lib/tables/slot-layout-core';

/** Fields picker / toggle copy — qty cannot leave the under-title lock. */
export const LINE_QTY_LOCKED_REASON = 'Qty stays under the item title' as const;

export function isLineQtyFieldId(fieldId: string | null | undefined): boolean {
  if (!fieldId) return false;
  return fieldId.endsWith('.qty') && !fieldId.endsWith('total_qty');
}

export function isLineQtyField(field: FieldDef): boolean {
  return (
    isLineQtyFieldId(field.id) &&
    field.displayType === 'number' &&
    fieldAllowsSlot(field, 'subtitle')
  );
}

/** The catalog's line-qty field, or null on desks that are not countable lines. */
export function lineQtyField(catalog: FieldCatalog): FieldDef | null {
  return catalog.find(isLineQtyField) ?? null;
}

/**
 * Pin `{family}.qty` as subtitle:1. Moves it out of the status band if a
 * product default parked it there. No-op when the catalog has no line qty.
 */
export function ensureLineQtySubtitle(layout: SlotLayout, catalog: FieldCatalog): SlotLayout {
  const field = lineQtyField(catalog);
  if (!field) return layout;
  const id = field.id;
  if (
    layout.subtitleBindings[0]?.fieldId === id &&
    !layout.statusBindings.some((b) => b.fieldId === id)
  ) {
    return layout;
  }
  const statusBindings = layout.statusBindings.filter((b) => b.fieldId !== id);
  const rest = layout.subtitleBindings.filter((b) => b.fieldId !== id);
  const restCapped = rest.slice(0, MAX_SUBTITLE_SLOTS - 1);
  return {
    ...layout,
    statusBindings,
    subtitleBindings: [{ fieldId: id }, ...restCapped],
  };
}

/** Binding order: qty stays subtitle:1 whenever it is in the band. */
export function pinLineQtySubtitleBindings(layout: SlotLayout): SlotLayout {
  const qty = layout.subtitleBindings.find((b) => isLineQtyFieldId(b.fieldId));
  if (!qty) return layout;
  if (layout.subtitleBindings[0]?.fieldId === qty.fieldId) return layout;
  return {
    ...layout,
    subtitleBindings: [qty, ...layout.subtitleBindings.filter((b) => b.fieldId !== qty.fieldId)],
  };
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

type SlotValueResolver = (fieldId: string) => CompoundSlotValue | null;

/**
 * Bound subtitle facts → Item-cell parts, qty then money pinned.
 *
 * `lineQtyMeaning` defaults to `order-line`, so every outbound peer keeps the
 * face it has; an inventory surface passes `on-hand`.
 */
export function slotSubtitlePartsFor(
  fieldIds: readonly string[],
  resolve: SlotValueResolver,
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
