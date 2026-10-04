/** Tech-All slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { SlotValue } from '@/lib/tables/field-catalog/slot-value';
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
): SlotValue | null {
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
