/**
 * Units slot resolvers — row + fieldId → the resolved fact a slot cell paints.
 * Pure functions; no React, no hooks.
 *
 * Presentation TONES (unit-status badge and dot, condition grade colour) stay
 * in the family's cell map, which resolves them from the same registries — this
 * module answers WHAT the fact says, in display text.
 *
 * `units.updated` resolves to the ABSOLUTE instant rather than the cell's
 * relative age ("3d"). The age face reads the clock, and a resolver that read
 * the clock would make one row's answer depend on when it happened to be
 * called; the cell keeps the relative face and its absolute tooltip, and a
 * bound column paints the day the unit actually moved.
 */

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
