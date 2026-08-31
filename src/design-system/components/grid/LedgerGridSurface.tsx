'use client';

import { useCallback, useMemo, type ReactNode, type Ref, type RefObject } from 'react';
import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import { LedgerGridSkeleton } from '@/design-system/components/grid/LedgerGridSkeleton';
import { LedgerGrid } from '@/design-system/components/grid/LedgerGrid';
import { useGridSurface } from '@/design-system/components/grid/useGridSurface';
import type {
  GridSurfaceDescriptor,
  LedgerGridColumnModel,
} from '@/design-system/components/grid/grid-surface-descriptor';
import type { RowGroup } from '@/lib/group-rows';
import { cn } from '@/utils/_cn';
import { TABLE_SURFACE_CLIP_CLASS, TABLE_SURFACE_SHEET_CLASS } from '@/design-system/tokens/table-surface';

/**
 * `LedgerGridSurface<Row, K, C>` — the descriptor-driven grid composer.
 *
 * One mounted shell, many {@link GridSurfaceDescriptor}s: the surface owns the
 * table shell (`surface="framed"` → {@link TABLE_SURFACE_CLIP_CLASS};
 * `surface="sheet"` → {@link TABLE_SURFACE_SHEET_CLASS}), the loading skeleton,
 * the teaching empty box, the TanStack headless sort surface (`useGridSurface`
 * — asc ↔ desc cycle, per-column desc-first) and the `LedgerGrid` mount. The
 * caller owns what is genuinely per-domain: data fetch, house grouping /
 * day-banding, sort durability, its column MODEL, and the row / group
 * renderers.
 *
 * ## What it stopped owning on 2026-08-29
 *
 * Per-staff column visibility, persisted drag-resize widths, controlled column
 * order and the column-display rail all went with the interactive layer
 * (`docs/todo/one-table-sot-teardown-HANDOFF.md` § 4.2). The surface now paints
 * the descriptor's columns, full stop — there is no per-staff delta between the
 * model and what the grid draws, so the header, the rows and the grid template
 * are structurally incapable of disagreeing about which tracks exist.
 *
 * Chrome (search, filter, tabs, counts) is not here and never was: it belongs
 * to {@link DataTable}, the one component that draws a table for a page.
 */
export interface LedgerGridColumnHeaderApi<K extends string, C extends LedgerGridColumnModel> {
  toggleColumnSort: (key: K) => void;
  /** The mounted columns — sourced from the descriptor that built the template. */
  columns: readonly C[];
}

interface LedgerGridSurfaceProps<Row, K extends string, C extends LedgerGridColumnModel> {
  /** The family's canonical column model. */
  columns: readonly C[];
  /**
   * Build this family's descriptor from its columns.
   *
   * Pass the module-level `makeXGridDescriptor` **reference**, not an inline
   * arrow: the descriptor is memoized on `[makeDescriptor, columns]` and it
   * carries the TanStack `columnDefs`, so a fresh identity every render would
   * rebuild the state engine's column list on every render.
   */
  makeDescriptor: (visible: readonly C[]) => GridSurfaceDescriptor<Row, C>;
  /** House-computed date bands → folds (grouping stays outside TanStack). */
  orderGroupsByDate: [string, RowGroup<Row>[]][];
  /** Flat rows for the TanStack state instance (never re-ordered by it). */
  rows: Row[];
  getRowId?: (row: Row) => string;
  /** Controlled column sort (caller owns durability — the URL). */
  sort: K | null;
  dir: 'asc' | 'desc' | null;
  onSortChange: (key: K, dir: 'asc' | 'desc') => void;
  /** Sticky column header. Call `toggleColumnSort` from header clicks. */
  renderColumnHeader: (api: LedgerGridColumnHeaderApi<K, C>) => ReactNode;
  renderGroup: (
    group: RowGroup<Row>,
    baseStripeIndex: number,
    api: { columns: readonly C[] },
    /**
     * Absolute ARIA index of the group's FIRST leaf, same stream as
     * `renderRow`'s. Dropping it is not cosmetic: a leaf row decides whether it
     * is inside a table from `rowIndex != null`, so a grouped body that never
     * receives one renders every row as `role="checkbox"` instead of
     * `role="row"` — a `role="table"` with no rows at all, and the
     * `aria-required-children` failure that cost the To-ship desk its
     * Accessibility score.
     */
    rowIndex?: number,
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
   * "No data yet" invites the create action, "no matches" invites clearing the
   * filter, and showing the first when the second is true tells the operator
   * their data is gone.
   */
  searchEmptyMessage?: string;
  /** Override the default dashed teaching box for settled-empty. */
  emptyState?: ReactNode;
  /** Override the default dashed teaching box for no-matches. */
  searchEmptyState?: ReactNode;
  /** True while a filter/search is active — picks the search-empty answer. */
  isSearching?: boolean;
  /** Sticky day bands (Testing History). Auto-suppressed under a column sort. */
  showDayHeaders?: boolean;
  /** Mirror of the LedgerGrid scroll body (keyboard nav / scroll-to-top). */
  scrollRef?: RefObject<HTMLDivElement | null>;
  /**
   * Page scroll ancestor. When set, the grid grows with content and
   * virtualizes against that port.
   */
  scrollParentRef?: RefObject<HTMLElement | null>;
  /** Scroll a row (by getRowKey) into view — deep-link / keyboard focus. */
  scrollToKey?: string | null;
  /**
   * First-paint row height estimate (px) for the virtualizer.
   *
   * Resolved by the CALLER from the column model it is mounting — a surface
   * that paints a taller row box must say so, or the scrollbar and every
   * scroll-to computation are wrong by the difference on every row.
   */
  rowEstimate?: number;
  /** Optional ref on the outer shell. */
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
   * Outer shell recipe. `framed` (default) — raised rounded card
   * ({@link TABLE_SURFACE_CLIP_CLASS}). `sheet` — flush plane
   * ({@link TABLE_SURFACE_SHEET_CLASS}).
   */
  surface?: 'framed' | 'sheet';
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
  surface = 'framed',
}: LedgerGridSurfaceProps<Row, K, C>) {
  const descriptor = useMemo(() => makeDescriptor(columns), [makeDescriptor, columns]);
  // Hand back the DESCRIPTOR's own list rather than `columns` — the same array,
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

  const { table } = useGridSurface<Row>({
    data: rows,
    columns: descriptor.columnDefs,
    getRowId,
    sorting,
    onSortingChange: handleSortingChange,
  });

  const toggleColumnSort = useCallback(
    (key: K) => {
      table.getColumn(key)?.toggleSorting();
    },
    [table],
  );

  // One object per render rather than one per ROW — `renderRow` is called once
  // per visible row by the virtualizer.
  const rowApi = useMemo(() => ({ columns: visible }), [visible]);

  const headerApi = useMemo<LedgerGridColumnHeaderApi<K, C>>(
    () => ({ toggleColumnSort, columns: visible }),
    [toggleColumnSort, visible],
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
    <div
      ref={shellRef as Ref<HTMLDivElement> | undefined}
      data-testid={testId}
      data-table-surface={surface === 'sheet' ? 'sheet' : ''}
      // A ledger grid is a data-collection REGION, so it carries Band 2
      // regardless of the page around it. Resolves --cf-motion-status for the
      // cold-start skeleton — see the motion-band block in globals.css.
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
          renderGroup={(group, baseStripeIndex, rowIndex) =>
            renderGroup(group, baseStripeIndex, rowApi, rowIndex)
          }
          renderRow={(row, stripeIndex, rowIndex) =>
            renderRow(row, stripeIndex, rowApi, rowIndex)
          }
          emptyState={resolvedEmpty}
          isSearching={isSearching && hasSearchEmpty}
          searchEmptyState={resolvedSearchEmpty}
        />
      )}
    </div>
  );
}
