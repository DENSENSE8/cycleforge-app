'use client';

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import { VirtualGroupedSections } from '@/design-system/components/grid/VirtualGroupedSections';
import { countGridRows } from '@/design-system/components/grid/grid-row-index';
import type { RowGroup } from '@/lib/group-rows';
import {
  ORDERS_QUEUE_GRID_WIDTH_VAR,
  ordersQueueGridWidthVarValue,
} from '@/lib/dashboard-order-row-layout';
import { cn } from '@/utils/_cn';

/**
 * `LedgerGrid<T>` — Workbench spreadsheet / ledger shell (DS SoT).
 *
 * One sticky column header, one always-virtualized body
 * ({@link VirtualGroupedSections}), and a per-surface `scrollX` contract.
 * Outbound Pending (via {@link OrdersGridView}) is the golden path:
 * `showDayHeaders={false}`, Date as a per-row column, `gridSkin="airtable"`.
 * Station / receiving feeds may pass `showDayHeaders` and/or `daySections`.
 *
 * Domain cell registries stay outside DS — pass `columnHeader` / `renderRow` /
 * `renderGroup`. Multi-child folds use {@link CollapsibleGroupRow}; Maximize2 /
 * open-row is domain `onOpenRecord`, not this shell.
 *
 * Design invariants:
 *  • **One sticky layer, measured** — header docks at `top-0`; ResizeObserver
 *    publishes `--cf-grid-header-h` for day-band sticky offset.
 *  • **Per-surface `scrollX`** — frozen identity pane vs clipped board.
 *  • **Ancestor page scroll** — when `scrollParentRef` is set (Pending under
 *    `DashboardScrollShell`), Y scroll lives on the parent so KPI strips can
 *    scroll away; this surface keeps X-only scroll (`overflow-y: clip`) so the
 *    sticky header docks under pinned chrome without a nested Y port.
 *  • **One render path** — always virtualized via VirtualGroupedSections.
 */
interface LedgerGridProps<T> {
  /** Date-ordered → folded groups (Pending / receiving PO fold). */
  orderGroupsByDate?: [string, RowGroup<T>[]][];
  /** Date-ordered → flat rows (station history / logs). Mutually exclusive with groups. */
  daySections?: [string, T[]][];
  /**
   * Sticky {@link DateGroupHeader} per day. Default `false` (Pending Date column).
   * Station / receiving feeds pass `true`.
   */
  showDayHeaders?: boolean;
  /** Horizontal scroll (flat spreadsheet). `false` clips overflow (vertical board). */
  scrollX?: boolean;
  /**
   * When `scrollX`, content-min rem sum published as `--cf-orders-grid-w` so every
   * virtualized row/header shares one width (locked columns). Omitted → `100%`.
   */
  contentMinWidthRem?: number;
  /** Width-override CSS custom properties for the grid surface (`--cf-col-*`). */
  columnVars?: CSSProperties;
  /** The sticky column-header row (caller composes it; it self-pins at `top-0`). */
  columnHeader: ReactNode;
  /** Grouped mode: render one fold (singleton row or multi-child disclosure). */
  renderGroup?: (group: RowGroup<T>, baseStripeIndex: number) => ReactNode;
  /** Render one leaf row at the given zebra-stripe index. */
  renderRow: (record: T, stripeIndex: number) => ReactNode;
  /** Stable key for flat `daySections` rows (windowing across re-sorts). */
  getRowKey?: (record: T, dayIndex: number) => string;
  /** Scroll a flat row into view by `getRowKey` value. */
  scrollToKey?: string | null;
  /** Shown centered when there are zero groups/sections and no active search. */
  emptyState: ReactNode;
  /** Shown centered when there are zero rows *and* a search is active. */
  searchEmptyState?: ReactNode;
  /** True while an active search yielded zero rows (picks `searchEmptyState`). */
  isSearching?: boolean;
  /** First-paint size estimates threaded to the virtualizer. */
  headerEstimate?: number;
  rowEstimate?: number;
  /** Optional external scroll region (page / stacked lanes); default = the internal body. */
  scrollParentRef?: RefObject<HTMLElement | null>;
  /**
   * Optional handle to the grid's scroll body (keyboard-nav / scroll-to-top).
   * When set, mirrors the internal body element onto this ref.
   */
  bodyRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  /**
   * Visual skin for the surface. `'airtable'` stamps `data-grid-skin="airtable"`,
   * which the scoped stylesheet in `globals.css` targets for a light connected
   * spreadsheet (hairline grid, opaque white header). Full-bleed Pending has no
   * outer card radius — gutters come from the workbench column.
   * Omitted → the plain hairline look (the vertical shelf-board never opts in).
   */
  gridSkin?: 'airtable';
  /**
   * Accessible name for the table. A `role="table"` with no name announces as a
   * bare "table" — pass the surface's human label (e.g. "Incoming cartons").
   */
  'aria-label'?: string;
  /** Test hook on the scroll body. */
  'data-testid'?: string;
}

export function LedgerGrid<T>({
  orderGroupsByDate,
  daySections,
  showDayHeaders = false,
  scrollX = false,
  contentMinWidthRem,
  columnVars,
  columnHeader,
  renderGroup,
  renderRow,
  getRowKey,
  scrollToKey,
  emptyState,
  searchEmptyState,
  isSearching = false,
  headerEstimate,
  rowEstimate,
  scrollParentRef,
  bodyRef: bodyRefProp,
  className,
  gridSkin,
  'aria-label': ariaLabel,
  'data-testid': dataTestId = 'ledger-grid-body',
}: LedgerGridProps<T>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Mirror the scroll body onto an optional caller ref (receiving keyboard nav).
  useLayoutEffect(() => {
    if (!bodyRefProp) return;
    const mutable = bodyRefProp as MutableRefObject<HTMLDivElement | null>;
    mutable.current = bodyRef.current;
    return () => {
      mutable.current = null;
    };
  });

  // Publish the column header's REAL rendered height as `--cf-grid-header-h` on
  // the scroll surface so day bands (when enabled) dock beneath it.
  useLayoutEffect(() => {
    const header = headerRef.current;
    const surface = bodyRef.current;
    if (!header || !surface) return;
    const publish = () => surface.style.setProperty('--cf-grid-header-h', `${header.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  const empty =
    (orderGroupsByDate?.length ?? 0) === 0 && (daySections?.length ?? 0) === 0;
  const rowCount = countGridRows({ orderGroupsByDate, daySections, showDayHeaders });
  // Self-scrolling body owns the virtualizer scroll unless an ancestor is passed.
  const useAncestorScroll = Boolean(scrollParentRef);
  // Ancestor page scroll + h-scroll (Pending): the header band must dock to the
  // PAGE port, but `overflow-x: auto` on this surface would make it a scroll
  // container — and a scroll container captures `position: sticky` on BOTH
  // axes, so the header could never stick to the page. Split mode moves the
  // horizontal scroll onto an inner body box; the header band stays outside it
  // (sticky against the page port, clipped) and its row is translated by the
  // synced `--cf-grid-sx` offset (see globals.css `[data-grid-split-x]`).
  const splitX = useAncestorScroll && scrollX;
  const xScrollRef = useRef<HTMLDivElement>(null);

  // When Y lives on an ancestor, depth under the sticky header follows that port.
  useLayoutEffect(() => {
    if (!useAncestorScroll || !scrollParentRef) return;
    const parent = scrollParentRef.current;
    const surface = bodyRef.current;
    const header = headerRef.current;
    if (!parent || !surface || !header) return;
    const sync = () => {
      const parentTop = parent.getBoundingClientRect().top;
      const headerTop = header.getBoundingClientRect().top;
      surface.classList.toggle('cf-grid-scrolled-y', headerTop <= parentTop + 1);
    };
    sync();
    parent.addEventListener('scroll', sync, { passive: true });
    return () => parent.removeEventListener('scroll', sync);
  }, [useAncestorScroll, scrollParentRef]);

  const surfaceStyle: CSSProperties = {
    ...columnVars,
    ...(scrollX
      ? {
          [ORDERS_QUEUE_GRID_WIDTH_VAR]: ordersQueueGridWidthVarValue(
            contentMinWidthRem ?? 40,
          ),
        }
      : {}),
  };

  // Split mode: mirror the inner body's h-scroll onto the surface as the
  // `--cf-grid-sx` offset (header-row translation) + the frozen-edge shadow.
  const syncSplitScroll = (el: HTMLElement) => {
    const surface = bodyRef.current;
    if (!surface) return;
    surface.classList.toggle('cf-grid-scrolled', el.scrollLeft > 0);
    surface.style.setProperty('--cf-grid-sx', `${-el.scrollLeft}px`);
  };

  const body = (
    <VirtualGroupedSections
      orderGroupsByDate={orderGroupsByDate}
      daySections={daySections}
      scrollParentRef={scrollParentRef ?? bodyRef}
      useAncestorScroll={useAncestorScroll}
      renderRow={renderRow}
      renderGroup={renderGroup}
      getRowKey={getRowKey}
      scrollToKey={scrollToKey}
      headerEstimate={headerEstimate}
      rowEstimate={rowEstimate}
      showDayHeaders={showDayHeaders}
      stickyHeaderTop={showDayHeaders ? 'var(--cf-grid-header-h, 0px)' : '0'}
    />
  );

  return (
    <div
      ref={bodyRef}
      // `table`, NOT `grid`. ARIA `grid` is a composite widget and asserting it
      // obligates the full APG keyboard contract (roving tabindex, arrow-key cell
      // navigation, Home/End, Ctrl+Home/End) which this shell does not implement.
      // `table` is the honest claim for tabular content whose cells may still hold
      // widgets. Omitted while empty so the empty-state message isn't announced as
      // a table with no rows.
      role={empty ? undefined : 'table'}
      aria-label={empty ? undefined : ariaLabel}
      // Only a WINDOW of rows is ever in the DOM, so the total must be declared
      // or AT reports "row 3 of 30" on a 1,200-row grid. Counted as if every
      // fold were expanded — see grid-row-index.ts for why that is correct.
      aria-rowcount={empty ? undefined : rowCount}
      data-cf-grid
      data-grid-skin={gridSkin}
      data-grid-split-x={splitX ? '' : undefined}
      data-testid={splitX ? undefined : dataTestId}
      onScroll={
        splitX
          ? undefined
          : (e) => {
              const el = e.currentTarget;
              // Frozen-edge shadow while fact columns scroll under the pinned identity pane.
              if (scrollX) el.classList.toggle('cf-grid-scrolled', el.scrollLeft > 0);
              // Self-scroll only: ancestor mode syncs cf-grid-scrolled-y from the parent.
              if (!useAncestorScroll) {
                el.classList.toggle('cf-grid-scrolled-y', el.scrollTop > 0);
              }
            }
      }
      className={cn(
        'relative flex min-w-0 w-full flex-col bg-surface-card',
        useAncestorScroll
          ? // Page owns Y — grow with content. Split mode keeps this surface a
            // NON-scroll container (clip only) so the sticky header docks to the
            // page port; the inner body box owns overflow-x.
            'overflow-x-clip'
          : cn(
              'h-full min-h-0 flex-1 overflow-y-auto no-scrollbar',
              scrollX ? 'overflow-x-auto' : 'overflow-x-hidden',
            ),
        className,
      )}
      style={surfaceStyle}
    >
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center py-40 text-center">
          {isSearching ? searchEmptyState ?? emptyState : emptyState}
        </div>
      ) : (
        <>
          {/* Sticky + frozen column header — pins to the active scrollport top
              (self or page ancestor); opaque so virtualized rows never paint
              through. Frozen select/title cells keep sticky-left inside this
              band (self-scroll), or counter-translate under split mode. */}
          <div
            ref={headerRef}
            // The caller's `columnHeader` carries `role="row"` + `role="columnheader"`.
            // Both have a REQUIRED context role (`row` needs rowgroup/table/grid;
            // `columnheader` needs a row in a table/grid). Without this rowgroup the
            // header roles are orphaned and the markup is spec-invalid.
            role="rowgroup"
            data-grid-col-header=""
            className={cn(
              'sticky top-0 z-sticky isolate shrink-0 bg-surface-card',
              splitX && 'overflow-x-clip',
            )}
          >
            {columnHeader}
          </div>
          {splitX ? (
            <div
              ref={xScrollRef}
              data-testid={dataTestId}
              className="min-w-0 w-full overflow-x-auto overflow-y-clip"
              onScroll={(e) => syncSplitScroll(e.currentTarget)}
            >
              {body}
            </div>
          ) : (
            body
          )}
        </>
      )}
    </div>
  );
}
