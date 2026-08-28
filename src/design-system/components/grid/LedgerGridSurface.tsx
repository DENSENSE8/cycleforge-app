'use client';

import { useCallback, useMemo, type ReactNode, type Ref, type RefObject } from 'react';
import type { ColumnOrderState, OnChangeFn, SortingState } from '@tanstack/react-table';
import { LedgerGridSkeleton } from '@/design-system/components/grid/LedgerGridSkeleton';
import { GridColumnGutter } from '@/design-system/components/grid/GridColumnDetailsTrigger';
import { LedgerGrid } from '@/design-system/components/grid/LedgerGrid';
import { useGridColumnWidths } from '@/components/ui/table-column-config/useGridColumnWidths';
import { useGridColumnWidthBounds } from '@/components/ui/table-column-config/useGridColumnWidthBounds';
import { useGridColumnVisibility } from '@/design-system/components/grid/useGridColumnVisibility';
import { useGridSurface } from '@/design-system/components/grid/useGridSurface';
import {
  clampPersistedGridColumnWidths,
  filterAppliedGridColumnWidths,
  gridColumnWidthVars,
} from '@/design-system/components/grid/grid-column-applied-widths';
import { GridColumnWidthBoundsProvider } from '@/design-system/components/grid/grid-column-width-bounds-context';
import { gridContentMinWidthPx } from '@/design-system/components/grid/grid-column-geometry';
import type {
  GridSurfaceDescriptor,
  LedgerGridColumnModel,
} from '@/design-system/components/grid/grid-surface-descriptor';
import type { RowGroup } from '@/lib/group-rows';
import type { TableId } from '@/lib/tables/table-columns';
import { cn } from '@/utils/_cn';
import { TABLE_SURFACE_CLIP_CLASS, TABLE_SURFACE_SHEET_CLASS } from '@/design-system/tokens/table-surface';

/**
 * `LedgerGridSurface<Row, K, C>` — the descriptor-driven Workbench spreadsheet
 * composer (plan Phase C). One mounted shell, many
 * {@link GridSurfaceDescriptor}s: the surface owns the table shell
 * (`surface="framed"` → {@link TABLE_SURFACE_CLIP_CLASS}; `surface="sheet"` →
 * {@link TABLE_SURFACE_SHEET_CLASS}), the loading skeleton, the teaching empty
 * box, the TanStack headless sort surface (`useGridSurface` — asc ↔ desc cycle,
 * per-column desc-first), the `LedgerGrid` mount (airtable skin + `scrollX` +
 * content-min), **column visibility resolution**, optional **viewport force-hide**
 * + **controlled column order**, and the column-display control + its rail (via
 * {@link GridColumnGutter}). The caller owns what is genuinely per-domain: data
 * fetch, house grouping/day-banding (OUTSIDE TanStack until plan Phase E), sort
 * durability (local state or URL), its column MODEL, and the header / row /
 * group renderers.
 *
 * ## The inversion — why the caller no longer narrows
 *
 * Until 2026-08-02 every grid view did the same six-part ritual — fourteen call
 * sites across thirteen files: a `useState(columnDetailsOpen)`, a
 * `useGridColumnVisibility`, a `useMemo(() => makeXDescriptor(visible))`, a
 * `columnDetails={{…}}` prop, a sibling `<GridColumnDetailsPanel>`, and the
 * `tableId` re-typed four times. ~40 identical lines per file, and the wiring is
 * exactly the part most likely to be mis-copied — the same failure mode
 * `makeLedgerGridColumnHeader`'s docblock names one level down.
 *
 * The reason it could not collapse was the argument order: the caller narrowed
 * **then** built (`makeXDescriptor(visible)`), so the surface received an
 * already-narrowed descriptor and had no idea what the full model was. Invert
 * it — the surface takes the **full** {@link columns} plus the family's
 * {@link makeDescriptor}, resolves visibility, and builds the descriptor from
 * the result — and the whole ritual has one home. That is byte-for-byte the
 * shape `makeLedgerGridColumnHeader` already uses (`layout` +
 * `defaultColumns`).
 *
 * What stays per family is the **column model, its cells, its rows and its sort
 * comparator**. Those genuinely differ, and collapsing them would be the fork
 * `pattern-evolution.md` bans. This surface owns the *plumbing*, not the
 * columns.
 *
 * Orders mounts this surface with `surface="sheet"`, optional `forceHidden`,
 * and the allowlisted `OrdersQueueColumnHeader` fork (resize + viewport
 * force-hide) via {@link renderColumnHeader}. Column order is pinned to the
 * layout SoT. Do **not** half-port that header onto `makeLedgerGridColumnHeader`.
 *
 * Station adopters: Incoming POS and Unbox / History /
 * Testing (`ReceivingGridHost`). Outbound: Ready + Orders
 * (`useOrdersSpreadsheet` → `NonlinearTableHost`).
 */

/** Reorder a visibility-resolved list to match a staff column-order preference. */
function orderVisibleColumns<C extends LedgerGridColumnModel>(
  columns: readonly C[],
  order: readonly string[] | undefined,
): C[] {
  if (!order || order.length === 0) return [...columns];
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const ordered: C[] = [];
  for (const key of order) {
    const col = byKey.get(key);
    if (col) {
      ordered.push(col);
      byKey.delete(key);
    }
  }
  for (const col of byKey.values()) ordered.push(col);
  return ordered;
}

export interface LedgerGridColumnHeaderApi<K extends string, C extends LedgerGridColumnModel> {
  toggleColumnSort: (key: K) => void;
  onResizeColumn: (key: string, px: number) => void;
  /** Drop one column's persisted width — SoT track returns (double-click grip). */
  onResetColumn: (key: string) => void;
  columns: readonly C[];
  /**
   * Present when the surface is running controlled column order — commit a new
   * MOVABLE-column key list after a header drag. Locked keys are re-prepended
   * by the caller's sanitizer.
   */
  onReorderColumns?: (nextMovable: string[]) => void;
  /** Reset to canonical order — only when a custom order is active. */
  onResetColumnOrder?: () => void;
  /** True while persisted order differs from the canonical column model. */
  isCustomOrder?: boolean;
}

interface LedgerGridSurfaceProps<Row, K extends string, C extends LedgerGridColumnModel> {
  /**
   * The family's **FULL canonical column model** — never pre-narrowed. The
   * surface resolves visibility from it and hands the result back through the
   * render props below, so no view calls `useGridColumnVisibility` and the
   * column-display rail can still offer the tracks that are currently OFF.
   */
  columns: readonly C[];
  /**
   * Build this family's descriptor from the VISIBLE columns.
   *
   * Pass the module-level `makeXGridDescriptor` **reference**, not an inline
   * arrow: the descriptor is memoized on `[makeDescriptor, visible]` and it
   * carries the TanStack `columnDefs`, so a fresh identity every render would
   * rebuild the state engine's column list on every render.
   */
  makeDescriptor: (visible: readonly C[]) => GridSurfaceDescriptor<Row, C>;
  /** House-computed date bands → folds (grouping stays outside TanStack). */
  orderGroupsByDate: [string, RowGroup<Row>[]][];
  /** Flat rows for the TanStack state instance (never re-ordered by it). */
  rows: Row[];
  getRowId?: (row: Row) => string;
  /** Controlled column sort (caller owns durability — local state or URL). */
  sort: K | null;
  dir: 'asc' | 'desc' | null;
  onSortChange: (key: K, dir: 'asc' | 'desc') => void;
  /**
   * Sticky column header. Call `toggleColumnSort` from header clicks, hand
   * `onResizeColumn` straight to the generated header, and pass `columns`
   * through — it is the visibility-RESOLVED list, sourced from the very
   * descriptor that built the grid template, so the header cannot draw a track
   * the geometry does not have.
   *
   * `onResizeColumn` is unconditional now that {@link tableId} is required:
   * there is always somewhere to persist a width, so there is no longer a
   * surface that must honestly withhold the grip rather than ship one that
   * silently forgets.
   *
   * When {@link columnOrder} is controlled, the api also carries reorder
   * helpers for the Orders allowlisted header fork.
   */
  renderColumnHeader: (api: LedgerGridColumnHeaderApi<K, C>) => ReactNode;
  renderGroup: (
    group: RowGroup<Row>,
    baseStripeIndex: number,
    api: { columns: readonly C[] },
  ) => ReactNode;
  /**
   * `rowIndex` is the absolute ARIA index across the flattened stream — Orders
   * threads it to leaf rows; families that do not need it ignore it.
   */
  renderRow: (
    row: Row,
    stripeIndex: number,
    api: { columns: readonly C[] },
    rowIndex?: number,
  ) => ReactNode;
  loading: boolean;
  /**
   * Settled-with-no-rows copy. This is the "nothing here YET" answer — teach the
   * next action, don't just say the list is empty.
   */
  emptyMessage: string;
  /**
   * Settled-with-no-MATCHES copy, when a filter or search is narrowing the list.
   *
   * A separate answer from `emptyMessage`, per `display/workbench.md`: "no data
   * yet" invites the create action, "no matches" invites clearing the filter, and
   * showing the first when the second is true tells the operator their data is
   * gone. `LedgerGrid` has always supported the split; this surface collapsed it
   * to one message until 2026-07-29, so every descriptor-driven grid answered
   * both questions the same way. Pass it whenever the surface has a search box.
   */
  searchEmptyMessage?: string;
  /**
   * Override the default dashed teaching box for settled-empty. Orders uses this
   * for a typed first-run empty; omit to keep {@link emptyMessage}.
   */
  emptyState?: ReactNode;
  /**
   * Override the default dashed teaching box for no-matches. Orders uses
   * `OrderSearchEmptyState`; omit to keep {@link searchEmptyMessage}.
   */
  searchEmptyState?: ReactNode;
  /** True while a filter/search is active — picks the search-empty answer. */
  isSearching?: boolean;
  /** Sticky day bands (Testing History). Auto-suppressed under a column sort. */
  showDayHeaders?: boolean;
  /** Mirror of the LedgerGrid scroll body (keyboard nav / scroll-to-top). */
  scrollRef?: RefObject<HTMLDivElement | null>;
  /**
   * Page scroll ancestor (Pending under `DashboardScrollShell`). When set, the
   * grid grows with content and virtualizes against that port.
   */
  scrollParentRef?: RefObject<HTMLElement | null>;
  /** Scroll a row (by getRowKey) into view — deep-link / keyboard focus. */
  scrollToKey?: string | null;
  /**
   * First-paint row height estimate (px) for the virtualizer.
   *
   * Resolved by the CALLER from the column model it is mounting — a surface
   * that paints a taller row box must say so, or the scrollbar and every
   * scroll-to computation are wrong by the difference on every row. Omitted →
   * the house default (`LEDGER_GRID_ROW_ESTIMATE_PX`).
   */
  rowEstimate?: number;
  /**
   * Optional ref on the outer shell — Orders attaches viewport force-hide
   * observation here.
   */
  shellRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  /**
   * Accessible name for the table — REQUIRED. `LedgerGrid` exposes
   * `role="table"`, and a table with no accessible name announces as a bare
   * "table" with no indication of what it holds. Name the collection, not the
   * page ("Incoming cartons", not "Incoming").
   */
  ariaLabel: string;
  /** Outer card / sheet testid; the scroll body gets `${testId}-scroll`. */
  testId: string;
  /**
   * Per-staff prefs identity (`staff_preferences.tableColumns[tableId]`) — the
   * ONE linkage key, and it is declared once per family. Visibility, drag-resize
   * widths and the column-display rail all key off this, so it is REQUIRED and
   * typed {@link TableId}: it used to be `string` here while
   * `GridColumnDetailsPanel` typed it `TableId`, i.e. the same key declared
   * twice, once loosely.
   *
   * A component that mounts under more than one prefs identity (Receiving:
   * Unbox/History `receiving` vs Testing History `testing`) takes it as a prop
   * with a default and forwards it — never a frozen module constant.
   */
  tableId: TableId;
  /**
   * Outer shell recipe. `framed` (default) — raised rounded card
   * ({@link TABLE_SURFACE_CLIP_CLASS}). `sheet` — flush Sheets plane
   * ({@link TABLE_SURFACE_SHEET_CLASS}); pair with `WORKBENCH_SHEET_HOST`.
   * Golden: Receiving / Unbox browse · outbound Orders.
   */
  surface?: 'framed' | 'sheet';
  /**
   * Ephemeral viewport collapse, keyed by column KEY. Never persisted — always
   * wins over staff Fields intent. Orders drives this via
   * `useViewportForcedHidden`.
   */
  forceHidden?: ReadonlySet<string>;
  /**
   * Controlled display order (staff prefs). When set with
   * {@link onColumnOrderChange}, the surface wires TanStack column order and
   * hands reorder helpers to {@link renderColumnHeader}.
   */
  columnOrder?: ColumnOrderState;
  onColumnOrderChange?: OnChangeFn<ColumnOrderState>;
  /**
   * Host for the column-display trigger (Band-3 / inspector View topics). When
   * set, the trigger portals there. With no host, no ▦ is painted at all — the
   * card-corner float was deleted 2026-08-08. See {@link GridColumnGutter}.
   */
  columnTriggerPortalTarget?: HTMLElement | null;
  /**
   * Reset to canonical order — caller owns persistence + toast. Only wired into
   * the header api while a custom order is active.
   */
  onResetColumnOrder?: () => void;
}

/** The house dashed teaching box — one shape for both settled-empty answers. */
function GridEmptyBox({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-xs rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center">
      <p className="text-sm font-semibold text-text-soft">{message}</p>
    </div>
  );
}

export function LedgerGridSurface<Row, K extends string, C extends LedgerGridColumnModel>({
  columns,
  makeDescriptor,
  orderGroupsByDate,
  rows,
  getRowId,
  sort,
  dir,
  onSortChange,
  renderColumnHeader,
  renderGroup,
  renderRow,
  loading,
  emptyMessage,
  searchEmptyMessage,
  emptyState,
  searchEmptyState,
  isSearching = false,
  showDayHeaders = false,
  scrollRef,
  rowEstimate,
  scrollParentRef,
  scrollToKey,
  shellRef,
  className,
  ariaLabel,
  testId,
  tableId,
  surface = 'framed',
  forceHidden,
  columnOrder,
  onColumnOrderChange,
  onResetColumnOrder,
  columnTriggerPortalTarget = null,
}: LedgerGridSurfaceProps<Row, K, C>) {
  // ONE visibility resolution: descriptor default tier + this staffer's delta
  // + optional ephemeral viewport collapse.
  const { columns: resolved, columnVisibility } = useGridColumnVisibility<C>({
    columns,
    tableId,
    forceHidden,
  });
  const orderedVisible = useMemo(
    () => orderVisibleColumns(resolved, columnOrder),
    [resolved, columnOrder],
  );
  const descriptor = useMemo(
    () => makeDescriptor(orderedVisible),
    [makeDescriptor, orderedVisible],
  );
  // Hand back the DESCRIPTOR's own list rather than `resolved` — the same array,
  // but sourced from the thing that computed `contentMinWidthRem` and the
  // TanStack defs, so the header, the rows and the grid template are
  // structurally incapable of disagreeing about which tracks exist.
  const visible = descriptor.columns;

  // Controlled sort mirror → TanStack state; header clicks route through the
  // table column (`toggleSorting`: asc ↔ desc, desc-first per def) and land
  // back in the caller's store via `onSortChange`.
  const sorting = useMemo<SortingState>(
    () => (sort && dir ? [{ id: sort, desc: dir === 'desc' }] : []),
    [sort, dir],
  );
  const handleSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next[0];
      if (first) onSortChange(first.id as K, first.desc ? 'desc' : 'asc');
    },
    [sorting, onSortChange],
  );

  const orderControlled = columnOrder !== undefined && onColumnOrderChange !== undefined;

  const { table } = useGridSurface<Row>({
    data: rows,
    columns: descriptor.columnDefs,
    getRowId,
    sorting,
    onSortingChange: handleSortingChange,
    columnVisibility: orderControlled || forceHidden ? columnVisibility : undefined,
    columnOrder: orderControlled ? columnOrder : undefined,
    onColumnOrderChange: orderControlled ? onColumnOrderChange : undefined,
  });

  // One style object drives header, rows, group summaries AND the frozen pane's
  // sticky-left `calc()` — they all read the same `--cf-col-*` vars, which is
  // what keeps a resized `title` from unpinning the identity pane.
  //
  // Quiet-display / locked tracks (`resizable: false`) and retired keys never
  // paint prefs — stale Unbox Date 12rem stamp widths stay inert.
  const { widths, setWidth, clearWidth } = useGridColumnWidths(tableId);
  const { boundsByKey } = useGridColumnWidthBounds(tableId);
  const appliedWidths = useMemo(() => {
    const filtered = filterAppliedGridColumnWidths(widths, columns);
    return clampPersistedGridColumnWidths(filtered, columns, boundsByKey);
  }, [widths, columns, boundsByKey]);
  const columnVars = useMemo(() => gridColumnWidthVars(appliedWidths), [appliedWidths]);
  // Live content-min (px) so `--cf-orders-grid-w` grows after drag-resize and the
  // sticky X gutter can measure overflow (rem-only floor stayed viewport-wide).
  // Only publish a live px floor when staff resized a track — rem floors scale
  // via `--cf-density` in `ledgerGridWidthVarValue`. Passing rem×16px at 80%
  // zoom would outrank the density-scaled rem floor and re-open empty slack.
  const contentMinWidthPx = useMemo(() => {
    if (Object.keys(appliedWidths).length === 0) return undefined;
    return gridContentMinWidthPx(visible, appliedWidths);
  }, [visible, appliedWidths]);

  const toggleColumnSort = useCallback(
    (key: K) => {
      table.getColumn(key)?.toggleSorting();
    },
    [table],
  );

  const isCustomOrder = useMemo(() => {
    if (!orderControlled || !columnOrder) return false;
    return columnOrder.some((key, i) => key !== columns[i]?.key);
  }, [orderControlled, columnOrder, columns]);

  const handleReorderColumns = useCallback(
    (nextMovable: string[]) => {
      if (!onColumnOrderChange) return;
      onColumnOrderChange(nextMovable);
    },
    [onColumnOrderChange],
  );

  // One object per render rather than one per ROW — `renderRow` is called once
  // per visible row by the virtualizer.
  const rowApi = useMemo(() => ({ columns: visible }), [visible]);

  const headerApi = useMemo<LedgerGridColumnHeaderApi<K, C>>(
    () => ({
      toggleColumnSort,
      onResizeColumn: setWidth,
      onResetColumn: clearWidth,
      columns: visible,
      ...(orderControlled
        ? {
            onReorderColumns: handleReorderColumns,
            onResetColumnOrder: isCustomOrder ? onResetColumnOrder : undefined,
            isCustomOrder,
          }
        : {}),
    }),
    [
      toggleColumnSort,
      setWidth,
      clearWidth,
      visible,
      orderControlled,
      handleReorderColumns,
      isCustomOrder,
      onResetColumnOrder,
    ],
  );

  const isEmpty =
    orderGroupsByDate.length === 0 || orderGroupsByDate.every(([, g]) => g.length === 0);
  const showSkeleton = loading && isEmpty;
  // A flat column sort replaces the banded order — day chrome would lie.
  const dayHeadersActive = showDayHeaders && !(sort && dir);

  const resolvedEmpty = emptyState ?? <GridEmptyBox message={emptyMessage} />;
  const resolvedSearchEmpty =
    searchEmptyState
    ?? (searchEmptyMessage ? <GridEmptyBox message={searchEmptyMessage} /> : undefined);
  const hasSearchEmpty = Boolean(resolvedSearchEmpty);

  return (
    <GridColumnWidthBoundsProvider boundsByKey={boundsByKey}>
      <GridColumnGutter
        tableId={tableId}
        columns={columns}
        triggerPortalTarget={columnTriggerPortalTarget}
      >
        <div
          ref={shellRef as Ref<HTMLDivElement> | undefined}
          data-testid={testId}
          data-table-surface={surface === 'sheet' ? 'sheet' : ''}
          // A ledger grid is a data-collection REGION, so it carries Band 2
          // regardless of the page around it (a table tile is Band 2 even on a
          // station canvas; the scan path never runs through this component).
          // Resolves --cf-motion-status for the cold-start skeleton — see the
          // motion-band block in src/styles/globals.css.
          data-motion="2"
          className={cn(
            'flex min-w-0 w-full flex-col',
            // Ancestor-scroll hosts grow with content; self-scroll hosts fill.
            !scrollParentRef && 'h-full min-h-0 flex-1',
            surface === 'sheet' ? TABLE_SURFACE_SHEET_CLASS : TABLE_SURFACE_CLIP_CLASS,
            className,
          )}
        >
          {showSkeleton ? (
            // Full-bleed, geometry-true stand-in: same row box as the grid it
            // becomes (no `p-3` — padding on a flush sheet broke the L1
            // repaint-not-reflow contract).
            <LedgerGridSkeleton rowEstimate={rowEstimate} />
          ) : (
            <LedgerGrid<Row>
              scrollX
              scrollParentRef={scrollParentRef}
              scrollToKey={scrollToKey}
              contentMinWidthRem={descriptor.contentMinWidthRem}
              contentMinWidthPx={contentMinWidthPx}
              columnVars={columnVars}
              gridSkin="airtable"
              // The virtualizer's scroll math must agree with the row box the
              // cells actually paint, or the scrollbar lies by ~17% per row on
              // a compound table. Resolved by the caller from the MOUNTED
              // column model, never guessed here.
              rowEstimate={rowEstimate}
              showDayHeaders={dayHeadersActive}
              aria-label={ariaLabel}
              data-testid={`${testId}-scroll`}
              bodyRef={scrollRef as RefObject<HTMLDivElement> | undefined}
              orderGroupsByDate={orderGroupsByDate}
              columnHeader={renderColumnHeader(headerApi)}
              renderGroup={(group, baseStripeIndex) => renderGroup(group, baseStripeIndex, rowApi)}
              renderRow={(row, stripeIndex, rowIndex) =>
                renderRow(row, stripeIndex, rowApi, rowIndex)
              }
              emptyState={resolvedEmpty}
              isSearching={isSearching && hasSearchEmpty}
              searchEmptyState={resolvedSearchEmpty}
            />
          )}
        </div>
      </GridColumnGutter>
    </GridColumnWidthBoundsProvider>
  );
}
