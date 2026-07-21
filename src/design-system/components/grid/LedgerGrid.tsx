'use client';

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { VirtualGroupedSections } from '@/components/dashboard/orders-queue/VirtualGroupedSections';
import type { RowGroup } from '@/lib/group-rows';
import { cn } from '@/utils/_cn';

/**
 * `LedgerGrid<T>` — the house spreadsheet/ledger grid primitive.
 *
 * A single, clean orchestrator for a **date-banded, order-grouped** ledger table:
 * one always-virtualized body (via {@link VirtualGroupedSections}), one sticky
 * mechanism, and a per-surface `scrollX` contract. It is the ground-up
 * replacement for the `OrdersQueueTable` branch-soup orchestrator (30 props / four
 * nested-ternary layout blocks / a forked dense-vs-virtual render path). The grid
 * is deliberately *dumb* about columns and cells: the caller supplies the sticky
 * `columnHeader`, the width-override `columnVars`, and `renderRow` / `renderGroup`
 * — LedgerGrid owns only the scroll shell, sticky docking, and windowing.
 *
 * Design invariants (the defects this primitive exists to kill):
 *  • **One sticky layer, measured — no magic number.** The column header docks at
 *    `top-0`; a ResizeObserver publishes its real height as `--cf-grid-header-h`,
 *    and the day-band headers dock at exactly that offset. Nothing hardcodes the
 *    old `top-9`/`36px` coupling.
 *  • **Per-surface `scrollX`.** Flat spreadsheet consumers pass `scrollX` (frozen
 *    identity pane pins while fact columns scroll under it, scroll-shadow on);
 *    vertical board consumers pass `scrollX={false}` (overflow clipped, frozen
 *    inert *by contract*, not by accident).
 *  • **One render path.** Always virtualized — no dense/virtual fork, no triplicated
 *    flattener, no duplicated stripe-index accumulator (all owned by
 *    {@link VirtualGroupedSections}).
 *
 * Zebra opacity lives in the row renderer: pass an OPAQUE stripe so frozen cells
 * (`bg-inherit`) never bleed the scrolling fact columns through the pinned pane.
 */
interface LedgerGridProps<T> {
  /** Date bands → folded order groups, in canonical render order. */
  orderGroupsByDate: [string, RowGroup<T>[]][];
  /** Horizontal scroll (flat spreadsheet). `false` clips overflow (vertical board). */
  scrollX?: boolean;
  /** Width-override CSS custom properties for the grid surface (`--cf-col-*`). */
  columnVars?: CSSProperties;
  /** The sticky column-header row (caller composes it; it self-pins at `top-0`). */
  columnHeader: ReactNode;
  /** Render one order group (singleton row or multi-product fold). */
  renderGroup: (group: RowGroup<T>, baseStripeIndex: number) => ReactNode;
  /** Render one leaf row at the given zebra-stripe index. */
  renderRow: (record: T, stripeIndex: number) => ReactNode;
  /** Shown centered when there are zero groups and no active search. */
  emptyState: ReactNode;
  /** Shown centered when there are zero groups *and* a search is active. */
  searchEmptyState?: ReactNode;
  /** True while an active search yielded zero rows (picks `searchEmptyState`). */
  isSearching?: boolean;
  /** First-paint size estimates threaded to the virtualizer. */
  headerEstimate?: number;
  rowEstimate?: number;
  /** Optional external scroll region (stacked lanes); default = the internal body. */
  scrollParentRef?: RefObject<HTMLElement | null>;
  className?: string;
  /**
   * Visual skin for the surface. `'airtable'` stamps `data-grid-skin="airtable"`,
   * which the scoped stylesheet in `globals.css` targets for a light connected
   * spreadsheet (hairline grid, rounded shell, opaque white header).
   * Omitted → the plain hairline look (the vertical shelf-board never opts in).
   */
  gridSkin?: 'airtable';
  /** Test hook on the scroll body. */
  'data-testid'?: string;
}

export function LedgerGrid<T>({
  orderGroupsByDate,
  scrollX = false,
  columnVars,
  columnHeader,
  renderGroup,
  renderRow,
  emptyState,
  searchEmptyState,
  isSearching = false,
  headerEstimate,
  rowEstimate,
  scrollParentRef,
  className,
  gridSkin,
  'data-testid': dataTestId = 'ledger-grid-body',
}: LedgerGridProps<T>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Publish the column header's REAL rendered height as `--cf-grid-header-h` on
  // the scroll surface, so day-band headers dock right beneath it with zero magic
  // numbers. Kills the `ORDERS_QUEUE_DATE_STICKY='top-9'`↔header-height coupling.
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

  const empty = orderGroupsByDate.length === 0;
  // Self-scrolling body owns the virtualizer scroll unless an ancestor is passed.
  const useAncestorScroll = Boolean(scrollParentRef);

  return (
    <div
      ref={bodyRef}
      data-cf-grid
      data-grid-skin={gridSkin}
      data-testid={dataTestId}
      onScroll={
        scrollX
          ? (e) => {
              // Frozen-edge shadow only while fact columns scroll under the pinned
              // identity pane. Direct classList (no React state) → no re-render.
              const el = e.currentTarget;
              el.classList.toggle('cf-grid-scrolled', el.scrollLeft > 0);
            }
          : undefined
      }
      className={cn(
        'relative flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto no-scrollbar bg-surface-card',
        scrollX ? 'overflow-x-auto' : 'overflow-x-hidden',
        className,
      )}
      style={columnVars}
    >
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center py-40 text-center">
          {isSearching ? searchEmptyState ?? emptyState : emptyState}
        </div>
      ) : (
        <>
          {/* One sticky layer #1 — the column header (self-pins at top-0). The
              wrapper stays a plain in-flow block purely so its height can be
              measured; the sticky header inside still pins to the scroll body. */}
          <div ref={headerRef}>{columnHeader}</div>
          <VirtualGroupedSections
            orderGroupsByDate={orderGroupsByDate}
            scrollParentRef={scrollParentRef ?? bodyRef}
            useAncestorScroll={useAncestorScroll}
            renderRow={renderRow}
            renderGroup={renderGroup}
            headerEstimate={headerEstimate}
            rowEstimate={rowEstimate}
            // Sticky layer #2 — day bands dock at the measured header height.
            stickyHeaderTop="var(--cf-grid-header-h, 36px)"
          />
        </>
      )}
    </div>
  );
}
