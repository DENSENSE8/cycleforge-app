/**
 * `admin.part-compatibility` — the compatibility-edge table definition,
 * capabilities and surface descriptor.
 *
 * Re-declares nothing: columns are the family SoT by reference.
 */

import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { PartCompatibilityEdgeRow } from '@/lib/sourcing/part-compatibility-row';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  PART_COMPATIBILITY_COMPOUND_COLUMNS,
  defaultDirForPartCompatibilityColumn,
  isPartCompatibilityColumnSortable,
  type PartCompatibilityGridColumn,
} from './part-compatibility-grid-layout';

/** Remove runs from the ROW MENU (and its trailing face). */
export const PART_COMPATIBILITY_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  dayBands: false,
};

function makePartCompatibilityGridDescriptor(
  columns: readonly PartCompatibilityGridColumn[],
): GridSurfaceDescriptor<PartCompatibilityEdgeRow, PartCompatibilityGridColumn> {
  return makeGridSurfaceDescriptor<PartCompatibilityEdgeRow, PartCompatibilityGridColumn>(
    'admin.part-compatibility',
    columns,
    {
      isSortable: (key) => isPartCompatibilityColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForPartCompatibilityColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    PART_COMPATIBILITY_GRID_CAPABILITIES,
  );
}

const PART_COMPATIBILITY_TABLE_DEFINITION = parseTableDefinition({
  id: 'admin.part-compatibility',
  tableId: 'part-compatibility',
  entityFamily: 'part-compatibility',
  cellMapKey: 'part-compatibility',
  ariaLabel: 'Compatibility edges',
  testId: 'part-compatibility-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: PART_COMPATIBILITY_GRID_CAPABILITIES,
  columns: PART_COMPATIBILITY_COMPOUND_COLUMNS,
});

export const PART_COMPATIBILITY_TABLE_BINDING: TableSurfaceBinding<
  PartCompatibilityEdgeRow,
  PartCompatibilityGridColumn
> = {
  definition: PART_COMPATIBILITY_TABLE_DEFINITION,
  columns: PART_COMPATIBILITY_COMPOUND_COLUMNS,
  makeDescriptor: makePartCompatibilityGridDescriptor,
  recordPlane: {
    kind: 'stage-overlay',
    reason:
      'Remove confirm stacks as DeskStageOverlay over /sourcing?mode=compatibility — the table stays mounted (Q5), so an admin can still read the edge they are about to unlink. The retired cell had NO confirm at all. Editing an edge itself still belongs to the Bose Models section, which is what this desk audits.',
  },
};
