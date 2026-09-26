/** Grid Surface Descriptor — the typed waist between a surface's Kinetic Ledger column models and the TanStack headless state engine (plan… */

import { createColumnHelper, type ColumnDef, type RowData } from '@tanstack/react-table';
import { isGridIdentityColumn } from './grid-column-editability';
import { gridContentMinWidthRem } from './grid-column-geometry';
import type { DateColumnFace } from './grid-column-type-track';
import type { ColumnType } from '@/lib/tables/table-columns';

/** Structural shape every house grid column model satisfies. */
export interface LedgerGridColumnModel {
  key: string;
  /** CSS grid track (`minmax(X, X)` fact tracks; only title flexes). */
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  /** This column's header IS its type glyph — no word beside it, at any track width. */
  headerGlyphOnly?: boolean;
  /** Always paint the header WORD, even when the track is narrower than the label-fit floor. */
  headerForceLabel?: boolean;
  type?: ColumnType;
  /**
   * Date DISPLAY FACE — only meaningful when `type === 'date'`. Drives the
   * typed track floor ({@link resolveGridColumnMinTrackRem}): day-only,
   * day+time stamp, or compact duration. Default when unset is `'day'`.
   */
  dateFace?: DateColumnFace;
  /**
   * Explicit content-floor rem. Prefer {@link dateFace} for dates; use this
   * only for a rare override that disagrees with the type/face map.
   */
  minTrackRem?: number;
  /** Justification OVERRIDE. */
  align?: 'start' | 'end' | 'center';
  /** Drag-resize OVERRIDE. */
  resizable?: boolean;
  /** Suppress the leading tone glyph on this column's value chips. */
  omitCellIcon?: boolean;
  /** Part of the frozen IDENTITY PANE — pinned left while the fact columns scroll, immovable under drag-reorder, and never in-cell editable. */
  frozen?: boolean;
  /**
   * Staff-preference key this track answers to (`staff_preferences
   * .tableColumns[tableId]`). Columns WITHOUT a `hideKey` are structural — they
   * never appear in the Fields menu and can never be toggled off.
   */
  hideKey?: string;
  /** `core` (default) ships ON — the lean set every staffer sees on first load; they may hide it. */
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

/** Declared surface features for one Workbench spreadsheet. */
export interface GridSurfaceCapabilities {
  /** Staff triage wash on leaf rows (`order-row-flags` — Orders only today). */
  rowTriageFlags: boolean;
  /** Checkbox multi-select + right-rail selection / select-all wiring. */
  multiSelect: boolean;
  /** Reserved: no surface mounts a cell editor — every grid cell is read-only. */
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
    // DERIVED, never passed in.
    contentMinWidthRem: gridContentMinWidthRem(columns),
    capabilities,
  };
}
