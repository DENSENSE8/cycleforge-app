/**
 * Grid Surface Descriptor — the typed waist between a surface's Kinetic Ledger
 * column models and the TanStack headless state engine (plan Phase C).
 *
 * Every Workbench spreadsheet keeps its column geometry in a house SoT list
 * (`ORDERS_QUEUE_COLUMNS`, `INCOMING_GRID_COLUMNS`, `RECEIVING_GRID_COLUMNS` —
 * all structurally {@link LedgerGridColumnModel}). {@link buildLedgerColumnDefs}
 * lifts such a list into TanStack `ColumnDef`s (id = house key, house model on
 * `meta.gridColumn`) so `useGridSurface` can own column / sorting / visibility
 * state while `ordersQueueGridTemplateFor`-style geometry keeps reading the
 * house models — TanStack never grows a second width system.
 *
 * A {@link GridSurfaceDescriptor} bundles one surface-mode's columns + defs +
 * content-min so composers mount grids per mode instead of re-deriving the
 * trio inline. Grouping / day-banding stays house (outside TanStack) until the
 * plan's Phase E explicitly adopts it.
 */

import { createColumnHelper, type ColumnDef, type RowData } from '@tanstack/react-table';
import type { ColumnType } from '@/lib/tables/table-columns';

/** Structural shape every house grid column model satisfies. */
export interface LedgerGridColumnModel {
  key: string;
  /** CSS grid track (`minmax(X, X)` fact tracks; only title flexes). */
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  hideKey?: string;
}

declare module '@tanstack/react-table' {
  // eslint-disable-next-line unused-imports/no-unused-vars -- upstream generic signature
  interface ColumnMeta<TData extends RowData, TValue> {
    /** House Kinetic Ledger column model (geometry + header presentation SoT). */
    gridColumn?: LedgerGridColumnModel;
  }
}

interface BuildLedgerColumnDefsOptions<Row, C extends LedgerGridColumnModel> {
  /** Which keys participate in column sorting (the surface's sort vocabulary). */
  isSortable?: (key: C['key']) => boolean;
  /** Keys whose first activation sorts descending (e.g. Age → most-late-first). */
  sortDescFirst?: (key: C['key']) => boolean;
  /** Locked identity keys (select · title) — never hideable. */
  isLocked?: (key: C['key']) => boolean;
  /**
   * State-math accessor per key (sort/group value — never display markup).
   * Sortable columns need SOME accessor for TanStack's `getCanSort`; row order
   * itself stays with the house comparators (`manualSorting`).
   */
  accessorFor?: (key: C['key']) => (row: Row) => unknown;
}

/** House column models → TanStack `ColumnDef`s (id = the stable house key). */
export function buildLedgerColumnDefs<Row, C extends LedgerGridColumnModel>(
  columns: readonly C[],
  {
    isSortable = () => false,
    sortDescFirst = () => false,
    isLocked = (key) => key === 'select' || key === 'title',
    accessorFor,
  }: BuildLedgerColumnDefsOptions<Row, C> = {},
): ColumnDef<Row, unknown>[] {
  const helper = createColumnHelper<Row>();
  return columns.map((col) => {
    const key = col.key as C['key'];
    const sortable = key !== 'select' && isSortable(key);
    if (!sortable && !accessorFor) {
      return helper.display({
        id: col.key,
        enableHiding: !isLocked(key),
        meta: { gridColumn: col },
      });
    }
    const accessor = accessorFor?.(key) ?? (() => null);
    if (key === 'select') {
      return helper.display({ id: col.key, enableHiding: false, meta: { gridColumn: col } });
    }
    return helper.accessor(accessor, {
      id: col.key,
      enableSorting: sortable,
      sortDescFirst: sortDescFirst(key),
      enableHiding: !isLocked(key),
      meta: { gridColumn: col },
    });
  });
}

/**
 * One surface-mode's grid contract: house column models + TanStack defs +
 * geometry content-min. Modes swap descriptors, not markup (plan §5).
 */
export interface GridSurfaceDescriptor<Row, C extends LedgerGridColumnModel = LedgerGridColumnModel> {
  /** Stable surface-mode id, e.g. `outbound.pending` / `fulfillment.tested`. */
  id: string;
  /** House Kinetic Ledger column models in canonical scan order. */
  columns: readonly C[];
  /** TanStack defs for {@link useGridSurface} (built once — stable reference). */
  columnDefs: readonly ColumnDef<Row, unknown>[];
  /** Sum of track rem floors (`--cf-orders-grid-w` h-scroll activation). */
  contentMinWidthRem: number;
}

/** Build a descriptor from a house column list (defs built once, stable). */
export function makeGridSurfaceDescriptor<Row, C extends LedgerGridColumnModel>(
  id: string,
  columns: readonly C[],
  contentMinWidthRem: number,
  defOptions?: BuildLedgerColumnDefsOptions<Row, C>,
): GridSurfaceDescriptor<Row, C> {
  return {
    id,
    columns,
    columnDefs: buildLedgerColumnDefs<Row, C>(columns, defOptions),
    contentMinWidthRem,
  };
}
