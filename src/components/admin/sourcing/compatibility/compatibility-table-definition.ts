/**
 * `admin.compatibility` — the compatibility rules table definition.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference.
 */

import type { CompatibilityEdgeRow } from '@/lib/sourcing/compatibility-edge-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { COMPATIBILITY_COMPOUND_COLUMNS, type CompatibilityGridColumn } from './compatibility-grid-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  COMPATIBILITY_GRID_CAPABILITIES,
  makeCompatibilityGridDescriptor,
} from './compatibility-grid-descriptor';

export const COMPATIBILITY_TABLE_DEFINITION = parseTableDefinition({
  id: 'admin.compatibility',
  tableId: 'compatibility',
  entityFamily: 'compatibility',
  cellMapKey: 'compatibility',
  ariaLabel: 'Compatibility rules',
  testId: 'compatibility-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: COMPATIBILITY_GRID_CAPABILITIES,
  columns: COMPATIBILITY_COMPOUND_COLUMNS,
});

export const COMPATIBILITY_TABLE_BINDING: TableSurfaceBinding<CompatibilityEdgeRow, CompatibilityGridColumn> = {
  definition: COMPATIBILITY_TABLE_DEFINITION,
  columns: COMPATIBILITY_COMPOUND_COLUMNS,
  makeDescriptor: makeCompatibilityGridDescriptor,
  recordPlane: {
    kind: 'none',
    reason:
      'This surface has no record plane — the row IS the fact, and its verbs run from the row menu.',
  },
};
