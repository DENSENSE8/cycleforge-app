/** SlotLayout — the strict WRITE gate (zod). */

import { z } from 'zod';
import {
  catalogById,
  fieldAllowsSlot,
  type FieldCatalog,
  type SlotKind,
} from '@/lib/tables/field-catalog/types';
import {
  MAX_STATUS_SLOTS,
  MAX_SUBTITLE_SLOTS,
  type SlotLayout,
} from '@/lib/tables/slot-layout-core';

export {
  MAX_STATUS_SLOTS,
  MAX_SUBTITLE_SLOTS,
  readStoredSlotLayout,
  slotLimitMessage,
} from '@/lib/tables/slot-layout-core';
export type { SlotBinding, SlotLayout } from '@/lib/tables/slot-layout-core';

const slotBindingSchema = z.strictObject({
  fieldId: z.string().min(1).max(128),
});

/**
 * Structural schema — shape and budgets only. Catalog-aware rules live in
 * {@link parseSlotLayout}. Pinned to the hand-written core type so the two
 * declarations cannot drift.
 */
export const slotLayoutSchema = z.strictObject({
  morph: z.enum(['sheet', 'compound']),
  identityFieldId: z.string().min(1).max(128),
  statusBindings: z.array(slotBindingSchema).max(MAX_STATUS_SLOTS),
  subtitleBindings: z.array(slotBindingSchema).max(MAX_SUBTITLE_SLOTS),
  amountFieldId: z.string().min(1).max(128).nullable().optional(),
}) satisfies z.ZodType<SlotLayout, SlotLayout>;

/** Strict parse against a family catalog — the WRITE gate. Throws with a named reason. */
export function parseSlotLayout(input: unknown, catalog: FieldCatalog): SlotLayout {
  const layout = slotLayoutSchema.parse(input);
  const byId = catalogById(catalog);
  const problems: string[] = [];

  const require = (fieldId: string, kind: SlotKind, at: string) => {
    const field = byId.get(fieldId);
    if (!field) {
      problems.push(`${at}: unknown field '${fieldId}'`);
      return;
    }
    if (!fieldAllowsSlot(field, kind)) {
      problems.push(`${at}: field '${fieldId}' does not allow the '${kind}' slot`);
    }
    if (kind === 'identity' && field.displayType !== 'id') {
      problems.push(`${at}: identity field '${fieldId}' must be displayType 'id'`);
    }
  };

  require(layout.identityFieldId, 'identity', 'identity');
  layout.statusBindings.forEach((b, i) => require(b.fieldId, 'status', `status:${i + 1}`));
  layout.subtitleBindings.forEach((b, i) => require(b.fieldId, 'subtitle', `subtitle:${i + 1}`));
  if (layout.amountFieldId) require(layout.amountFieldId, 'amount', 'amount');

  const bound = [
    layout.identityFieldId,
    ...layout.statusBindings.map((b) => b.fieldId),
    ...layout.subtitleBindings.map((b) => b.fieldId),
    ...(layout.amountFieldId ? [layout.amountFieldId] : []),
  ];
  const dupes = bound.filter((id, i) => bound.indexOf(id) !== i);
  if (dupes.length > 0) {
    problems.push(`duplicate bindings: ${[...new Set(dupes)].join(', ')}`);
  }

  if (problems.length > 0) {
    throw new Error(`invalid slot layout: ${problems.join('; ')}`);
  }
  return layout;
}
