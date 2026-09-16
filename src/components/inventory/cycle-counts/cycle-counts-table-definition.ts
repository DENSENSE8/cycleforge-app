/**
 * `inventory.cycle-counts` — the cycle-count campaigns table definition.
 *
 * Re-declares nothing: columns + capabilities are the family SoT by reference,
 * and the canonical columns are the product-default MATERIALIZATION
 * (`CYCLECOUNTS_COMPOUND_COLUMNS`), never a hand array.
 */

import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { CycleCountCampaignRow } from '@/lib/inventory/cycle-count-campaign-row';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  CYCLECOUNTS_COMPOUND_COLUMNS,
  cycleCountsSortFactFor,
  defaultDirForCycleCountsColumn,
  type CycleCountsGridColumn,
} from './cycle-counts-grid-layout';

/**
 * The campaign list is a READ surface. Every verb on this desk is either page
 * chrome (the create form above the table) or lives on the campaign's own
 * detail route — there were ZERO verbs in a cell, which is why this port needs
 * no `rowActions` at all. `multiSelect` stays on for the bulk copy-TSV bar the
 * shared select gutter carries.
 */
export const CYCLECOUNTS_GRID_CAPABILITIES: GridSurfaceCapabilities = {
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
export function makeCycleCountsGridDescriptor(
  columns: readonly CycleCountsGridColumn[],
): GridSurfaceDescriptor<CycleCountCampaignRow, CycleCountsGridColumn> {
  return makeGridSurfaceDescriptor<CycleCountCampaignRow, CycleCountsGridColumn>(
    'inventory.cycle-counts',
    columns,
    {
      isSortable: (key) => columns.some((c) => c.key === key && cycleCountsSortFactFor(c) !== null),
      sortDescFirst: (key) => defaultDirForCycleCountsColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    CYCLECOUNTS_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
export const CYCLECOUNTS_TABLE_DEFINITION = parseTableDefinition({
  id: 'inventory.cycle-counts',
  tableId: 'cycle-counts',
  entityFamily: 'cycle-counts',
  cellMapKey: 'cycle-counts',
  ariaLabel: 'Cycle count campaigns',
  testId: 'cycle-counts-grid-body',
  surface: 'sheet',
  // The list is ordered newest-first by created_at, but a campaign is a
  // long-lived container rather than a dated event — a sticky day band per
  // campaign would band almost every row on its own.
  showDayHeaders: false,
  capabilities: CYCLECOUNTS_GRID_CAPABILITIES,
  columns: CYCLECOUNTS_COMPOUND_COLUMNS,
});

export const CYCLECOUNTS_TABLE_BINDING: TableSurfaceBinding<
  CycleCountCampaignRow,
  CycleCountsGridColumn
> = {
  definition: CYCLECOUNTS_TABLE_DEFINITION,
  columns: CYCLECOUNTS_COMPOUND_COLUMNS,
  makeDescriptor: makeCycleCountsGridDescriptor,
  // A campaign row IS a page: `/inventory/cycle-counts/<id>` is where
  // counts get submitted and pending-review lines get approved or rejected —
  // a work surface with its own table, far more than a peek panel holds. The
  // retired cell expressed this as a `<Link>` inside the name; it is the row's
  // open intent now (catalog's `navigate` precedent).
  recordPlane: {
    kind: 'navigate',
    reason:
      'A campaign has its own route where lines are counted, approved and rejected — far more than a peek panel holds.',
  },
};
