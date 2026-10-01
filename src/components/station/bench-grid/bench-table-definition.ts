/** `tech.bench` / `packer.bench` — the two station-bench table definitions. */

import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import {
  makeGridSurfaceDescriptor,
  type GridSurfaceCapabilities,
  type GridSurfaceDescriptor,
} from '@/design-system/components/grid';
import type { OrdersQueueColumn } from '@/lib/dashboard-order-row-layout';
import { parseTableDefinition } from '@/lib/tables/table-definition';
import {
  PACKER_COMPOUND_COLUMNS,
  TECH_COMPOUND_COLUMNS,
  defaultDirForBenchColumn,
  packerSortFactFor,
  techSortFactFor,
} from './bench-grid-layout';

/**
 * A bench log is a READ surface: the scan already happened, and the verbs that
 * change it live at the station, not in a cell. `multiSelect` stays on for the
 * bulk copy-TSV bar the benches have always carried.
 */
export const TECH_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  dayBands: false,
};

/** Same answers as the tech bench — declared per family, never shared by alias. */
export const PACKER_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  dayBands: false,
};

/** Build the descriptor from a RESOLVED column list (post-visibility), so `contentMinWidthRem` and the TanStack defs follow the tracks that… */
function makeTechGridDescriptor(
  columns: readonly OrdersQueueColumn[],
): GridSurfaceDescriptor<QueueRowRecord, OrdersQueueColumn> {
  return makeGridSurfaceDescriptor<QueueRowRecord, OrdersQueueColumn>(
    'tech.bench',
    columns,
    {
      isSortable: (key) => columns.some((c) => c.key === key && techSortFactFor(c) !== null),
      sortDescFirst: (key) => defaultDirForBenchColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    TECH_GRID_CAPABILITIES,
  );
}

function makePackerGridDescriptor(
  columns: readonly OrdersQueueColumn[],
): GridSurfaceDescriptor<QueueRowRecord, OrdersQueueColumn> {
  return makeGridSurfaceDescriptor<QueueRowRecord, OrdersQueueColumn>(
    'packer.bench',
    columns,
    {
      isSortable: (key) => columns.some((c) => c.key === key && packerSortFactFor(c) !== null),
      sortDescFirst: (key) => defaultDirForBenchColumn(columns, key) === 'desc',
      isLocked: (key) => columns.some((c) => c.key === key && c.frozen === true),
    },
    PACKER_GRID_CAPABILITIES,
  );
}

/**
 * Validated at module load: a definition that violates a structural law throws
 * here rather than painting a broken grid.
 */
const TECH_BENCH_DEFINITION = parseTableDefinition({
  id: 'tech.bench',
  tableId: 'tech',
  entityFamily: 'tech',
  cellMapKey: 'tech',
  ariaLabel: 'Tech bench history',
  testId: 'tech-bench-grid-body',
  surface: 'sheet',
  // The bench bands by the scan instant, and the compound feed paints one band
  // — the stamp is a per-row track (`dates`), not a sticky day header.
  showDayHeaders: false,
  capabilities: TECH_GRID_CAPABILITIES,
  columns: TECH_COMPOUND_COLUMNS,
});

const PACKER_BENCH_DEFINITION = parseTableDefinition({
  id: 'packer.bench',
  tableId: 'packer',
  entityFamily: 'packer',
  cellMapKey: 'packer',
  ariaLabel: 'Packer bench history',
  testId: 'packer-bench-grid-body',
  surface: 'sheet',
  showDayHeaders: false,
  capabilities: PACKER_GRID_CAPABILITIES,
  columns: PACKER_COMPOUND_COLUMNS,
});

export const TECH_TABLE_BINDING: TableSurfaceBinding<QueueRowRecord, OrdersQueueColumn> = {
  definition: TECH_BENCH_DEFINITION,
  columns: TECH_COMPOUND_COLUMNS,
  makeDescriptor: makeTechGridDescriptor,
  /** Migration debt, declared honestly. */
  recordPlane: { kind: 'inspector', occupantId: 'detail:order' },
};

export const PACKER_TABLE_BINDING: TableSurfaceBinding<QueueRowRecord, OrdersQueueColumn> = {
  definition: PACKER_BENCH_DEFINITION,
  columns: PACKER_COMPOUND_COLUMNS,
  makeDescriptor: makePackerGridDescriptor,
  // Same inspector as the tech bench — one panel, two logs. See above.
  recordPlane: { kind: 'inspector', occupantId: 'detail:order' },
};
