/**
 * `inventory.cycle-count-lines` — the per-campaign count LINES table
 * definition.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference,
 * and the canonical columns are the product-default MATERIALIZATION
 * (`CYCLECOUNTLINES_COMPOUND_COLUMNS`), never a hand array.
 */

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

/**
 * `inCellEdit: false` — and that is the whole ruling on the retired Counted
 * cell.
 *
 * The desk's one data-entry control was an `<input type="number">` inside a
 * cell. No family in this repo sets `inCellEdit: true` on a compound mount,
 * and a `CompoundRowAction` carries a fixed payload, so there is no lawful
 * in-row editor to port it onto — minting one would be an engine change. The
 * count is a row VERB that opens a stage-overlay carrying the input
 * (`recordPlane` below).
 *
 * `multiSelect` stays on for the bulk copy-TSV bar every slot peer carries:
 * lifting a run of out-of-tolerance lines into a variance write-up is a real
 * thing an admin does with this page.
 */
export const CYCLECOUNTLINES_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render. `columns` is REQUIRED: a module-constant default is the
 * `grid-default` debt the discover scanner deletes.
 */
export function makeCycleCountLinesGridDescriptor(
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
export const CYCLECOUNTLINES_TABLE_DEFINITION = parseTableDefinition({
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
