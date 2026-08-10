'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import { VirtualGroupedSections } from '@/design-system/components/grid/VirtualGroupedSections';
import { countGridRows, hasGridRows } from '@/design-system/components/grid/grid-row-index';
import {
  LEDGER_GRID_WIDTH_VAR,
  ledgerGridWidthVarValue,
} from '@/design-system/components/grid/grid-cell-chrome';
import { applyGridOverflowXClasses } from '@/design-system/components/grid/grid-overflow-x';
import { GridStickyXScrollbar } from '@/design-system/components/grid/GridStickyXScrollbar';
import { useSyncedHorizontalScrollbar } from '@/design-system/components/grid/useSyncedHorizontalScrollbar';
import { TABLE_FROZEN_HEADER_CLASS } from '@/design-system/tokens/table-surface';
import type { RowGroup } from '@/lib/group-rows';
import { cn } from '@/utils/_cn';

/**
 * `LedgerGrid<T>` — Workbench spreadsheet / ledger shell (DS SoT).
 *
 * One sticky column header, one always-virtualized body
 * ({@link VirtualGroupedSections}), and a per-surface `scrollX` contract.
 * Outbound Pending (via {@link OrdersGridHost}) is the golden path:
 * `showDayHeaders={false}`, Date as a per-row column, `gridSkin="airtable"`.
 * Station / receiving feeds may pass `showDayHeaders` and/or `daySections`.
 *
 * Domain cell registries stay outside DS — pass `columnHeader` / `renderRow` /
 * `renderGroup`. Sheet list bodies render **flat leaves** (grouping orders rows
 * upstream only); parent→child rollups live on {@link LedgerDrillHost} /
 * {@link LedgerDrillParentMap}. Maximize2 / open-row is domain `onOpenRecord`,
 * not this shell.
 *
 * Design invariants:
 *  • **One sticky layer, measured** — header docks at `top-0`; ResizeObserver
 *    publishes `--cf-grid-header-h` for day-band sticky offset.
 *  • **Per-surface `scrollX`** — frozen identity pane vs clipped board.
 *  • **Sticky bottom X gutter** — when `scrollX`, a synced visible scrollbar
 *    sits at the bottom of the visible sheet (self-scroll flex) or sticks to
 *    the page port (split-x). Body keeps `no-scrollbar`; edge shadows stay.
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
  /**
   * Live content-min in px (SoT rem floors + persisted `--cf-col-*` overrides).
   * Lifts `--cf-orders-grid-w` and remeasures the sticky X gutter after resize.
   */
  contentMinWidthPx?: number;
  /** Width-override CSS custom properties for the grid surface (`--cf-col-*`). */
  columnVars?: CSSProperties;
  /** The sticky column-header row (caller composes it; it self-pins at `top-0`). */
  columnHeader: ReactNode;
  /** Grouped mode: render one fold (singleton row or multi-child disclosure). */
  renderGroup?: (group: RowGroup<T>, baseStripeIndex: number) => ReactNode;
  /** Render one leaf row at the given zebra-stripe index. */
  /** `rowIndex` is the ABSOLUTE index across the flattened stream — pass it to a
   *  row that renders inside this `role="table"` so it can claim `role="row"`
   *  with a correct `aria-rowindex` (only a window is ever in the DOM). */
  renderRow: (record: T, stripeIndex: number, rowIndex?: number) => ReactNode;
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
  contentMinWidthPx,
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
  // Outer shell — edge-shadow classes + CSS vars. Self-scroll with scrollX
  // keeps Y/X on an INNER port so the sticky X gutter can sit as a flex sibling.
  const surfaceRef = useRef<HTMLDivElement>(null);
  // Self-scroll virtualizer / onScroll / caller bodyRef target.
  const scrollPortRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const xScrollRef = useRef<HTMLDivElement>(null);

  // Empty means NO ROWS — not "no bands". Testing the band count made a surface
  // that always emits one band (`[['', groups]]`, the natural shape for a flat
  // list) render its column headers over a void whenever it had nothing to show,
  // instead of the teaching box the caller passed in `emptyState`.
  const empty = !hasGridRows({ orderGroupsByDate, daySections });
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
  // Self-scroll + scrollX: dual-axis port is nested so the X gutter can pin.
  // Column header sits OUTSIDE that port (flex sibling above) — sticky-inside-
  // dual-axis still lets absolute body chips paint through the band when the
  // sheet narrows (inspector push). H-scroll mirrors via `--cf-grid-sx` the
  // same way split-x does (see globals.css `[data-grid-split-x]`).
  const selfScrollX = scrollX && !useAncestorScroll;
  // Header row is translated by body scrollLeft (not native co-scroll).
  const headerSyncedX = splitX || selfScrollX;
  // Vertical-only self-scroll (shelf board): surface IS the scrollport.
  const selfScrollYOnly = !useAncestorScroll && !scrollX;

  // Real h-scroll source for the sticky gutter (and edge-shadow metrics).
  const hScrollSourceRef = splitX ? xScrollRef : scrollPortRef;
  const stickyXEnabled = scrollX && !empty;
  const { gutterRef, spacerWidth, overflowX } = useSyncedHorizontalScrollbar(
    hScrollSourceRef,
    stickyXEnabled,
    contentMinWidthRem,
    contentMinWidthPx,
  );

  // Self-scrolling mode windows against our OWN scroll port, which is still null
  // on the first render — so the virtualizer would initialize with no scroll
  // element and hand back zero items. Attaching a ref does not re-render, so
  // nothing ever re-reads it and the grid stays permanently blank. One post-mount
  // render lets `getScrollElement()` see the node. Ancestor-scroll consumers are
  // unaffected: their ref belongs to a parent already mounted.
  const [, forceScrollElementRead] = useState(0);
  useLayoutEffect(() => {
    if (scrollParentRef) return;
    forceScrollElementRead((n) => n + 1);
  }, [scrollParentRef]);

  // Mirror the scroll body onto an optional caller ref (receiving keyboard nav).
  // Self-scroll → nested port (or surface when Y-only). Split-x → surface
  // (page owns Y; callers still want a stable grid root).
  useLayoutEffect(() => {
    if (!bodyRefProp) return;
    const mutable = bodyRefProp as MutableRefObject<HTMLDivElement | null>;
    mutable.current =
      selfScrollYOnly
        ? surfaceRef.current
        : selfScrollX
          ? scrollPortRef.current
          : surfaceRef.current;
    return () => {
      mutable.current = null;
    };
  });

  // Publish the column header's REAL rendered height as `--cf-grid-header-h` on
  // the scroll surface so day bands (when enabled) dock beneath it.
  useLayoutEffect(() => {
    const header = headerRef.current;
    const surface = surfaceRef.current;
    if (!header || !surface) return;
    const publish = () => surface.style.setProperty('--cf-grid-header-h', `${header.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  // When Y lives on an ancestor, depth under the sticky header follows that port.
  useLayoutEffect(() => {
    if (!useAncestorScroll || !scrollParentRef) return;
    const parent = scrollParentRef.current;
    const surface = surfaceRef.current;
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

  // Dual h-scroll edge shadows (`cf-grid-overflow-start` / `-end`) — ResizeObserver
  // so the RIGHT shadow shows at rest when columns sit off-card (Notion cue).
  // Classes land on `[data-cf-grid]`; scroll metrics come from the real X port.
  useLayoutEffect(() => {
    if (!scrollX) return;
    const surface = surfaceRef.current;
    if (!surface) return;

    const scrollEl = () => (splitX ? xScrollRef.current : scrollPortRef.current);
    const sync = () => {
      const el = scrollEl();
      if (!el) return;
      applyGridOverflowXClasses(surface, el);
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(surface);
    const initial = scrollEl();
    if (initial && initial !== surface) {
      ro.observe(initial);
      if (initial.firstElementChild instanceof Element) {
        ro.observe(initial.firstElementChild);
      }
    } else if (surface.firstElementChild instanceof Element) {
      ro.observe(surface.firstElementChild);
    }
    return () => ro.disconnect();
  }, [scrollX, splitX, empty, contentMinWidthRem, contentMinWidthPx, selfScrollX]);

  const surfaceStyle: CSSProperties = {
    ...columnVars,
    ...(scrollX
      ? {
          [LEDGER_GRID_WIDTH_VAR]: ledgerGridWidthVarValue(
            contentMinWidthRem ?? 40,
            contentMinWidthPx,
          ),
        }
      : {}),
  };

  // Split mode: mirror the inner body's h-scroll onto the surface as the
  // `--cf-grid-sx` offset (header-row translation) + overflow edge shadows.
  const syncSplitScroll = (el: HTMLElement) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    applyGridOverflowXClasses(surface, el);
    surface.style.setProperty('--cf-grid-sx', `${-el.scrollLeft}px`);
  };

  const body = (
    <VirtualGroupedSections
      orderGroupsByDate={orderGroupsByDate}
      daySections={daySections}
      scrollParentRef={
        scrollParentRef
        ?? (selfScrollX ? scrollPortRef : surfaceRef)
      }
      useAncestorScroll={useAncestorScroll}
      renderRow={renderRow}
      renderGroup={renderGroup}
      getRowKey={getRowKey}
      scrollToKey={scrollToKey}
      headerEstimate={headerEstimate}
      rowEstimate={rowEstimate}
      showDayHeaders={showDayHeaders}
      // Self-scroll keeps the column header OUTSIDE the Y port — day bands
      // dock at the port top, not under a co-scrolled sticky band height.
      stickyHeaderTop={
        showDayHeaders && !selfScrollX ? 'var(--cf-grid-header-h, 0px)' : '0'
      }
    />
  );

  const headerBand = (
    <div
      ref={headerRef}
      // The caller's `columnHeader` carries `role="row"` + `role="columnheader"`.
      // Both have a REQUIRED context role (`row` needs rowgroup/table/grid;
      // `columnheader` needs a row in a table/grid). Without this rowgroup the
      // header roles are orphaned and the markup is spec-invalid.
      role="rowgroup"
      data-grid-col-header=""
      className={cn(
        // `relative` keeps the band a positioning context for anything a
        // family anchors to the VISIBLE header rather than the translated
        // wide header row (frozen-edge chrome under split / self-scroll-x).
        // Opaque card fill — never translucent/blur under absolute rows.
        'relative z-header isolate shrink-0',
        TABLE_FROZEN_HEADER_CLASS,
        // Split-x / page Y: stick under chrome. Self-scroll-x: flex-pinned
        // above the body port (not sticky) so rows cannot leak through.
        !selfScrollX && 'sticky top-0',
        headerSyncedX && 'overflow-x-clip',
      )}
    >
      {columnHeader}
    </div>
  );

  // Always mount when scrollX + rows so the sync hook can attach; collapse
  // visually when content fits (empty sunken track reads as fake bottom padding).
  const stickyGutter = stickyXEnabled ? (
    <GridStickyXScrollbar
      gutterRef={gutterRef}
      spacerWidth={spacerWidth}
      mode={splitX ? 'sticky' : 'flex'}
      className={cn(!overflowX && 'pointer-events-none h-0 opacity-0')}
    />
  ) : null;

  return (
    <div
      ref={surfaceRef}
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
      data-grid-split-x={headerSyncedX ? '' : undefined}
      data-testid={splitX || selfScrollX ? undefined : dataTestId}
      onScroll={
        selfScrollYOnly
          ? (e) => {
              const el = e.currentTarget;
              el.classList.toggle('cf-grid-scrolled-y', el.scrollTop > 0);
            }
          : undefined
      }
      className={cn(
        'relative flex min-w-0 w-full flex-col bg-surface-card',
        useAncestorScroll
          ? // Page owns Y — grow with content. Split mode keeps this surface a
            // NON-scroll container (clip only) so the sticky header docks to the
            // page port; the inner body box owns overflow-x.
            'overflow-x-clip'
          : selfScrollX
            ? // Constrained sheet: header flex-pinned; Y/X on the nested body
              // port; gutter is a flex sibling.
              'h-full min-h-0 flex-1 overflow-hidden'
            : cn(
                'h-full min-h-0 flex-1 overflow-y-auto overscroll-y-none no-scrollbar',
                'overflow-x-hidden',
              ),
        className,
      )}
      style={surfaceStyle}
    >
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center py-40 text-center">
          {isSearching ? searchEmptyState ?? emptyState : emptyState}
        </div>
      ) : splitX ? (
        <>
          {headerBand}
          <div
            ref={xScrollRef}
            data-testid={dataTestId}
            className="min-w-0 w-full overflow-x-auto overflow-y-clip overscroll-x-none no-scrollbar"
            onScroll={(e) => syncSplitScroll(e.currentTarget)}
          >
            {body}
          </div>
          {stickyGutter}
        </>
      ) : selfScrollX ? (
        <>
          {headerBand}
          <div
            ref={scrollPortRef}
            data-testid={dataTestId}
            className={cn(
              'relative min-h-0 min-w-0 w-full flex-1',
              // Dual-axis body port only — column header is a flex sibling above
              // so absolute rows cannot paint through it. H-scroll syncs the
              // header via `--cf-grid-sx` (data-grid-split-x).
              'overflow-x-auto overflow-y-auto overscroll-x-none overscroll-y-none no-scrollbar',
            )}
            onScroll={(e) => {
              const el = e.currentTarget;
              syncSplitScroll(el);
              el.classList.toggle('cf-grid-scrolled-y', el.scrollTop > 0);
              // Mirror Y-scrolled cue onto the shell so header depth CSS still
              // matches `[data-cf-grid].cf-grid-scrolled-y`.
              surfaceRef.current?.classList.toggle('cf-grid-scrolled-y', el.scrollTop > 0);
            }}
          >
            {body}
          </div>
          {stickyGutter}
        </>
      ) : (
        <>
          {headerBand}
          {body}
        </>
      )}
    </div>
  );
}
