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
import { isGridIdentityColumn } from './grid-column-editability';
import { gridContentMinWidthRem } from './grid-column-geometry';
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
  /**
   * Justification OVERRIDE. Leave unset — `type` already decides
   * (`resolveGridColumnAlign`), and deriving is what keeps a column's header
   * and its cells from drifting apart. Set this only when a column genuinely
   * disagrees with its type's default, and set it HERE so the exception is
   * declared once rather than re-typed per surface.
   */
  align?: 'start' | 'end';
  /**
   * Suppress the leading tone glyph on this column's value chips.
   *
   * In a typed grid the column header already carries the data-type glyph, so
   * repeating it in every cell paints the same mark twice down the track — the
   * Unbox tracking column drew a MapPin in its header AND in all ~40 rows
   * beneath it. The Pending grid solved this first with a `variant: 'plain'`
   * prop; declaring it on the column instead makes it a property of "this
   * column is typed in a grid" rather than a thing each surface remembers.
   *
   * Chips keep their icons everywhere else (rails, sidebars, mobile stacks),
   * where no header labels the value — this never strips them globally.
   */
  omitCellIcon?: boolean;
  /**
   * Part of the frozen IDENTITY PANE — pinned left while the fact columns
   * scroll, immovable under drag-reorder, and never in-cell editable. Must be a
   * contiguous prefix of the canonical order (the sticky-left offset sums the
   * widths of the frozen columns before it).
   *
   * Declared per surface rather than by a house key list because the pane
   * answers "what does an operator scan first HERE": Orders freezes
   * `select · order · title`; Catalog / Receiving / Incoming / Repair / Pickup
   * freeze `select · title`. Derive the key list with `gridFrozenKeys` — never
   * re-type it beside the model. A frozen column carries no `hideKey` (it is
   * structural, so the Fields menu can never take the identity pane away).
   */
  frozen?: boolean;
  /**
   * Staff-preference key this track answers to (`staff_preferences
   * .tableColumns[tableId]`). Columns WITHOUT a `hideKey` are structural — they
   * never appear in the Fields menu and can never be toggled off.
   */
  hideKey?: string;
  /**
   * `core` (default) ships ON — the lean set every staffer sees on first load;
   * they may hide it. `optional` ships OFF — an opt-in track a staffer adds from
   * the Fields menu. This is what makes the descriptor the SoT for the DEFAULT
   * view instead of "everything, minus whatever each staffer hid": adding an
   * `optional` column never widens anyone's grid unasked.
   *
   * Requires a `hideKey` — an `optional` column with no pref key would be
   * permanently invisible (asserted by `grid-column-tier.guard.test.ts`).
   */
  tier?: 'core' | 'optional';
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
  /** Locked identity keys — never hideable (defaults to {@link isGridIdentityColumn}). */
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
    isLocked = (key) => isGridIdentityColumn(key),
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
 * Declared surface features for one Workbench spreadsheet.
 *
 * Capabilities are **opt-in and explicit** on every descriptor — never inferred
 * from column keys or left undefined. Catalog cannot paint staff triage row
 * colours because its descriptor sets `rowTriageFlags: false`; Orders can
 * because it sets `true`. Row chrome (`ledgerRowFillClass` in queue-row-chrome)
 * and future shell mounts read this bag; adapters must not invent a feature
 * the descriptor omitted.
 */
export interface GridSurfaceCapabilities {
  /** Staff triage wash on leaf rows (`order-row-flags` — Orders only today). */
  rowTriageFlags: boolean;
  /** Checkbox multi-select + ContextualSelectionBar / select-all wiring. */
  multiSelect: boolean;
  /** In-cell editors via LedgerCellEditor / isGridColumnInCellEditable. */
  inCellEdit: boolean;
  /** Fields menu / staff column prefs (`hideKey` + `tier`). */
  fieldsMenu: boolean;
  /** Sticky civil-day bands (Receiving Testing History, etc.). */
  dayBands: boolean;
}

/**
 * One surface-mode's grid contract: house column models + TanStack defs +
 * geometry content-min + capabilities. Modes swap descriptors, not markup
 * (plan §5).
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
  /** Declared surface features — gate row chrome / shell mounts. */
  capabilities: GridSurfaceCapabilities;
}

/** Build a descriptor from a house column list (defs built once, stable). */
export function makeGridSurfaceDescriptor<Row, C extends LedgerGridColumnModel>(
  id: string,
  columns: readonly C[],
  defOptions: BuildLedgerColumnDefsOptions<Row, C> | undefined,
  capabilities: GridSurfaceCapabilities,
): GridSurfaceDescriptor<Row, C> {
  return {
    id,
    columns,
    columnDefs: buildLedgerColumnDefs<Row, C>(columns, defOptions),
    // DERIVED, never passed in. All five surfaces handed this the sum of their
    // own visible tracks, which is now one shared function — so the parameter
    // could only ever be right or stale, and a stale one silently mis-sizes the
    // h-scroll activation width against the template it is supposed to match.
    contentMinWidthRem: gridContentMinWidthRem(columns),
    capabilities,
  };
}
