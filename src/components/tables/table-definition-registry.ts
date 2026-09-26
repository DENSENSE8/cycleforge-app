/** The table DEFINITION registry — one place that knows every Workbench spreadsheet definition in the product, keyed by `<family>.<view>` id. */

import { REGISTERED_BINDINGS } from './registered-bindings';
import type { TableDefinition } from '@/lib/tables/table-definition';

/** The registered DEFINITIONS — derived from {@link REGISTERED_BINDINGS} rather than hand-listed beside it. */
const REGISTERED_DEFINITIONS: readonly TableDefinition[] = REGISTERED_BINDINGS.map(
  (binding) => binding.definition,
);

export const TABLE_DEFINITIONS: Readonly<Record<string, TableDefinition>> = Object.freeze(
  Object.fromEntries(REGISTERED_DEFINITIONS.map((d) => [d.id, d])),
);

/** Registered ids, sorted — the enumeration guards and Studio read. */
export function tableDefinitionIds(): string[] {
  return Object.keys(TABLE_DEFINITIONS).sort();
}

/**
 * Look up a definition's DATA by id. Returns `undefined` for an unknown id —
 * a caller resolving a stored/authored id must answer for the miss rather than
 * silently mounting a different grid.
 */
export function getTableDefinition(id: string): TableDefinition | undefined {
  return TABLE_DEFINITIONS[id];
}
