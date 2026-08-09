/**
 * `cellMapKey` seam — the TableDefinition field that names which per-family
 * cell map paints system columns.
 *
 * Until Wave U2 completed, every page still passed hand-written render props;
 * this module is the **reader** so definitions are no longer dead schema.
 * Custom columns (`custom:*`) never live in a family map — they route through
 * {@link isCustomFieldColumnKey} → CustomFieldCell.
 *
 * A host that rendered "any SQL column" would be the Airtable mega-row the
 * nonlinear plan kills. This registry only maps known `entityFamily` values.
 */

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
