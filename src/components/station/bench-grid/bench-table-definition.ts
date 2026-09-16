/**
 * `tech.bench` / `packer.bench` — the two station-bench table definitions.
 *
 * These are the last third-engine surfaces to join the waist. The benches used
 * to paint `StationHistoryTable` → `StationListTable` → a raw `LedgerGrid` over
 * the hand array `STATION_HISTORY_COLUMNS`: no binding, no catalog, no Fields
 * picker, and a sort vocabulary derived from the array rather than the facts.
 * Registering them costs a catalog, a resolver, an adapter and these two
 * definitions — no new display (`TABLE_ENGINE_ACCEPTANCE`).
 *
 * **Two definitions, not one parametric binding.** Orders can be one binding
 * across seven lanes because those lanes are the same entity narrowed by a
 * query param. Tech and Packer are two stores answering two questions, and the
 * registry's own law is that two bindings must never share a prefs bucket —
 * hiding a column on the pack bench must not densify the test bench.
 *
 * Re-declares nothing: columns and capabilities are the family SoT by
 * reference, and the canonical columns are the product-default MATERIALIZATION
 * (`TECH_COMPOUND_COLUMNS` / `PACKER_COMPOUND_COLUMNS`), never a hand array.
 */

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
  fieldsMenu: true,
  dayBands: false,
};

/** Same answers as the tech bench — declared per family, never shared by alias. */
export const PACKER_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: true,
  dayBands: false,
};

/**
 * Build the descriptor from a RESOLVED column list (post-visibility), so
 * `contentMinWidthRem` and the TanStack defs follow the tracks that actually
 * render. `columns` is REQUIRED: a module-constant default is the `grid-default`
 * debt the discover scanner deletes — inheriting a column model by silence is
 * how a second SoT gets minted.
 */
export function makeTechGridDescriptor(
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

export function makePackerGridDescriptor(
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
export const TECH_BENCH_DEFINITION = parseTableDefinition({
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

export const PACKER_BENCH_DEFINITION = parseTableDefinition({
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
  /**
   * Migration debt, declared honestly. A bench row emits the app event
   * `open-shipped-details` (`useStationDetailsSelection.openDetails`), which
   * `StationDetailsHandler` turns into a `ShippedDetailsPanel` — and that panel
   * is the rail's `detail:order` occupant (`RAIL_OCCUPANT_ID.inspect`, pinned by
   * `right-rail/selection-occupancy.test.ts`). It is NOT a station work surface:
   * `kind: 'station'` would document a gesture the bench does not perform.
   *
   * No `keyedByRecord`: the bench HAS a prev/next walk
   * (`navigate-shipped-details`), and a per-record occupant id would replay the
   * rail's exit → enter on every step of it.
   */
  recordPlane: { kind: 'inspector', occupantId: 'detail:order' },
};

export const PACKER_TABLE_BINDING: TableSurfaceBinding<QueueRowRecord, OrdersQueueColumn> = {
  definition: PACKER_BENCH_DEFINITION,
  columns: PACKER_COMPOUND_COLUMNS,
  makeDescriptor: makePackerGridDescriptor,
  // Same inspector as the tech bench — one panel, two logs. See above.
  recordPlane: { kind: 'inspector', occupantId: 'detail:order' },
};
