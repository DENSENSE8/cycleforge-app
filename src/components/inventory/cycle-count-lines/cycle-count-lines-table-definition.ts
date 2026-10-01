/** `inventory.cycle-count-lines` — the per-campaign count LINES table definition. */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { CycleCountLineRow } from '@/lib/inventory/cycle-count-line-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  CYCLECOUNTLINES_COMPOUND_COLUMNS,
  defaultDirForCycleCountLinesColumn,
  isCycleCountLinesColumnSortable,
  type CycleCountLinesGridColumn,
} from './cycle-count-lines-grid-layout';

/** `inCellEdit: false` — and that is the whole ruling on the retired Counted cell. */
export const CYCLECOUNTLINES_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  dayBands: false,
};

/** Build the descriptor from a RESOLVED column list (post-visibility), so `contentMinWidthRem` and the TanStack defs follow the tracks that… */
function makeCycleCountLinesGridDescriptor(
  columns: readonly CycleCountLinesGridColumn[],
): GridSurfaceDescriptor<CycleCountLineRow, CycleCountLinesGridColumn> {
  return makeGridSurfaceDescriptor<CycleCountLineRow, CycleCountLinesGridColumn>(
    'inventory.cycle-count-lines',
    columns,
    {
      isSortable: (key) => isCycleCountLinesColumnSortable(columns, key),
      sortDescFirst: (key) => defaultDirForCycleCountLinesColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    CYCLECOUNTLINES_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
const CYCLECOUNTLINES_TABLE_DEFINITION = parseTableDefinition({
  id: 'inventory.cycle-count-lines',
  tableId: 'cycle-count-lines',
  entityFamily: 'cycle-count-lines',
  cellMapKey: 'cycle-count-lines',
  ariaLabel: 'Cycle count lines',
  testId: 'cycle-count-lines-grid-body',
  surface: 'sheet',
  // The rows are ordered by workflow state then bin, not by a day — the SQL
  // `ORDER BY CASE status` is the whole point of the list, and a day band
  // would cut it into meaningless slices.
  showDayHeaders: false,
  capabilities: CYCLECOUNTLINES_GRID_CAPABILITIES,
  columns: CYCLECOUNTLINES_COMPOUND_COLUMNS,
});

export const CYCLECOUNTLINES_TABLE_BINDING: TableSurfaceBinding<
  CycleCountLineRow,
  CycleCountLinesGridColumn
> = {
  definition: CYCLECOUNTLINES_TABLE_DEFINITION,
  columns: CYCLECOUNTLINES_COMPOUND_COLUMNS,
  makeDescriptor: makeCycleCountLinesGridDescriptor,
  recordPlane: {
    kind: 'stage-overlay',
    reason:
      "The count itself is the record form: `CycleCountLinePlane` stacks as a DeskStageOverlay over /inventory/cycle-counts/[id] (law Q5), so a counter can still read the bin's neighbours while typing the number. It replaced an `<input type=\"number\">` inside the Counted cell — a parameterised write has no lawful home on a compound row, and `inCellEdit` stays false.",
  },
};
