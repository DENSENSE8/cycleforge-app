/** Units slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import { conditionGradeTableLabel } from '@/lib/conditions';
import { formatDateKeyShort } from '@/utils/date';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveUnitsSlotValue(
  row: UnitsOverviewRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'units.serial':
      return { kind: 'value', text: str(row.serial_number) };
    case 'units.status':
      return { kind: 'value', text: str(row.current_status) };
    case 'units.condition': {
      const grade = str(row.condition_grade);
      return { kind: 'value', text: grade ? conditionGradeTableLabel(grade) : null };
    }
    case 'units.location':
      return { kind: 'value', text: str(row.current_location) };
    case 'units.updated': {
      const raw = str(row.updated_at);
      return { kind: 'value', text: raw ? formatDateKeyShort(raw.slice(0, 10)) : null };
    }
    default:
      return null;
  }
}
