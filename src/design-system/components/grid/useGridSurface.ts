'use no memo';
'use client';

/** `useGridSurface<Row>` — the Cycle Forge **headless grid state waist** (grid-surface-descriptor plan, engine hybrid B-). */

import {
  getCoreRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnOrderState,
  type OnChangeFn,
  type SortingState,
  type Table,
  type VisibilityState,
} from '@tanstack/react-table';

interface UseGridSurfaceOptions<Row> {
  /** Row data (house fetch/mutation waist owns it; TanStack never fetches). */
  data: Row[];
  /** Mode column set — TanStack `ColumnDef`s (stable per mode). */
  columns: readonly ColumnDef<Row, unknown>[];
  /** Stable row id (entity id — never an array index). */
  getRowId?: (row: Row) => string;
  /** Controlled sort state — mirror of the durable URL `?sort=` / `?dir=`. */
  sorting?: SortingState;
  /** Sort intent chokepoint — write back to the URL SoT here. */
  onSortingChange?: OnChangeFn<SortingState>;
  /** Controlled visibility — mirror of viewport force-hide / staff prefs. */
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  /** Controlled display order — mirror of the persisted staff column order. */
  columnOrder?: ColumnOrderState;
  /** Reorder intent chokepoint — persist to staff prefs here. */
  onColumnOrderChange?: OnChangeFn<ColumnOrderState>;
}

interface GridSurface<Row> {
  /** The TanStack table instance (state chokepoint — `getColumn`, `setColumnOrder`…). */
  table: Table<Row>;
  /**
   * Visible leaf columns in display order — computed INSIDE the no-memo waist
   * so consumers never call table getters from their own render (see module
   * doc). Fresh array each render; map `column.columnDef.meta` for house data.
   */
  visibleLeafColumns: Column<Row, unknown>[];
  /** All leaf columns in display order (visible + hidden). */
  leafColumns: Column<Row, unknown>[];
}

const noop = () => {};

export function useGridSurface<Row>({
  data,
  columns,
  getRowId,
  sorting = [],
  onSortingChange,
  columnVisibility = {},
  onColumnVisibilityChange,
  columnOrder = [],
  onColumnOrderChange,
}: UseGridSurfaceOptions<Row>): GridSurface<Row> {
  const table = useReactTable<Row>({
    data,
    columns: columns as ColumnDef<Row, unknown>[],
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    // House compare/band/fold logic orders the rows (URL stays the SoT);
    // TanStack carries the STATE, not the row model math.
    manualSorting: true,
    // Header click cycles asc ↔ desc (house `toggleColumnSort` semantics) —
    // never "remove sort" as a third state.
    enableSortingRemoval: false,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
    },
    onSortingChange: onSortingChange ?? noop,
    onColumnVisibilityChange: onColumnVisibilityChange ?? noop,
    onColumnOrderChange: onColumnOrderChange ?? noop,
  });

  return {
    table,
    visibleLeafColumns: table.getVisibleLeafColumns(),
    leafColumns: table.getAllLeafColumns(),
  };
}
