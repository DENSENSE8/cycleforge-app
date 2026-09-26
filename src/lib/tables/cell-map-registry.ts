/** `cellMapKey` seam — the TableDefinition field that names which per-family cell map paints system columns. */

import type { TableDefinition } from '@/lib/tables/table-definition';
import { isCustomFieldColumnKey } from '@/lib/tables/custom-field-keys';

/** Closed set — mirrors `TABLE_ENTITY_FAMILIES` in table-definition.ts. */
type CellMapKey = TableDefinition['cellMapKey'];

/**
 * Resolve the cell-map key a definition declares. Throws if missing (Zod
 * already requires it on parse — this is the runtime waist for merges).
 */
export function resolveCellMapKey(definition: Pick<TableDefinition, 'cellMapKey' | 'entityFamily'>): CellMapKey {
  return definition.cellMapKey ?? definition.entityFamily;
}

/**
 * Paint path for one column key:
 * - `custom` → shared CustomFieldCell (no family file edit)
 * - `system` → family cell map named by `cellMapKey`
 */
export function resolveColumnPaintPath(
  columnKey: string,
): 'custom' | 'system' {
  return isCustomFieldColumnKey(columnKey) ? 'custom' : 'system';
}
