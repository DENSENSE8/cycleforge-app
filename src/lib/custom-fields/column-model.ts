/**
 * Build LedgerGrid column models from custom_field_defs for runtime merge
 * (before trailing `_fill` when present).
 */

import type { LedgerGridColumnModel } from '@/lib/grid/grid-surface-descriptor';
import type { ColumnType } from '@/lib/tables/table-columns';
import { customFieldColumnKey } from '@/lib/tables/custom-field-keys';
import type { CustomFieldDef, CustomFieldValueType } from './types';

function toColumnType(type: CustomFieldValueType): ColumnType {
  switch (type) {
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    case 'boolean':
    case 'select':
      return 'tag';
    case 'text':
    default:
      return 'text';
  }
}

function defaultWidth(type: CustomFieldValueType): string {
  switch (type) {
    case 'number':
      return 'minmax(5rem, 5rem)';
    case 'date':
      return 'minmax(6rem, 6rem)';
    case 'boolean':
      return 'minmax(4.5rem, 4.5rem)';
    case 'select':
      return 'minmax(7rem, 7rem)';
    default:
      return 'minmax(8rem, 8rem)';
  }
}

/** One optional-tier hideable track per live def. */
function customFieldDefToColumn(def: CustomFieldDef): LedgerGridColumnModel {
  const key = customFieldColumnKey(def.key);
  return {
    key,
    width: defaultWidth(def.type),
    label: def.label,
    type: toColumnType(def.type),
    hideKey: key,
    tier: 'optional',
    resizable: false,
  };
}

/**
 * Insert custom columns just before `_fill` (or append if no fill track).
 * Preserves system column identity types on the host family's column model.
 */
export function mergeCustomFieldColumns<C extends LedgerGridColumnModel>(
  systemColumns: readonly C[],
  defs: readonly CustomFieldDef[],
): C[] {
  if (defs.length === 0) return [...systemColumns];
  const custom = defs.map((d) => customFieldDefToColumn(d) as C);
  const fillIdx = systemColumns.findIndex((c) => c.key === '_fill');
  if (fillIdx < 0) return [...systemColumns, ...custom];
  return [
    ...systemColumns.slice(0, fillIdx),
    ...custom,
    ...systemColumns.slice(fillIdx),
  ];
}
