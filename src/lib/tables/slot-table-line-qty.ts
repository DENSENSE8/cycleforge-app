/**
 * Line-qty identity — engine law for every PRODUCT_TABLES peer.
 *
 * Qty is not a column between Status and Amount. It is the first fact under
 * the Item title on the compound morph (a `subtitle:1` track after Title on
 * sheet). A family that catalogs `{family}.qty` as a number subtitle field
 * gets that place automatically: product defaults, org overrides, and a table
 * added next week all resolve through {@link ensureLineQtySubtitle}.
 *
 * `bins.total_qty` is occupancy, not line qty — the id must be exactly `.qty`.
 */

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
 * To-ship qty FACE — bare number, two-character reservation, 1 quiet / 2+ warn.
 * Every family uses this; nobody invents a second count tone.
 */
export function lineQtySubtitlePart(fieldId: string, text: string): CompoundSubtitlePart {
  const qty = Number(text);
  const countTone = orderRowQtyTone(Number.isFinite(qty) ? qty : 1);
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

/** Bound subtitle facts → Item-cell parts, qty then money pinned. */
export function slotSubtitlePartsFor(
  fieldIds: readonly string[],
  resolve: SlotValueResolver,
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
      parts.push(lineQtySubtitlePart(fieldId, value.text));
      continue;
    }
    parts.push({ text: value.text, key: fieldId });
  }
  return pinLineMoneyAfterQty(pinLineQtyFirst(parts));
}
