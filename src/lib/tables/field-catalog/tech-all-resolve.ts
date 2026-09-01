/**
 * Tech-All slot resolvers — row + fieldId → the resolved fact a slot cell
 * paints. Pure functions; no React, no hooks.
 *
 * The row is already a normalization across four stores, so there is no
 * vocabulary to declare here: `typeLabel` and `stage` are resolved upstream by
 * the triage builder and this module reads what it was handed.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { TechAllTriageRow } from '@/lib/tech/tech-all-triage';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveTechAllSlotValue(
  row: TechAllTriageRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'tech-all.item':
      return { kind: 'value', text: str(row.id) };
    case 'tech-all.type':
      return { kind: 'value', text: str(row.typeLabel) };
    case 'tech-all.stage':
      return { kind: 'value', text: str(row.stage) };
    case 'tech-all.urgency':
      return { kind: 'value', text: String(row.urgencyRank) };
    default:
      return null;
  }
}
