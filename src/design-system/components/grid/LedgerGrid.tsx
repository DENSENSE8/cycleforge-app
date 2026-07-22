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
 * A single, clean orchestrator for a **date-ordered, order-grouped** ledger table:
 * one always-virtualized body (via {@link VirtualGroupedSections}), one sticky
 * column header, and a per-surface `scrollX` contract. Absolute civil dates live
 * in a per-row **Date** column — no floating day-band chrome (Pending Grid).
 * Board / Packed keep day bands via {@link OrdersQueueTable} + DateGroupHeader.
 *
 * Design invariants (the defects this primitive exists to kill):
 *  • **One sticky layer, measured — no magic number.** The column header docks at
 *    `top-0`; a ResizeObserver publishes its real height as `--cf-grid-header-h`
 *    for consumers that still need it (scroll shadows / future chrome).
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
  /** Date-ordered → folded order groups (sort/fold only; no day-band UI). */
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
  // the scroll surface (frozen-edge / chrome consumers). Day bands are not used
  // on this surface — Date is a per-row column.
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
        (e) => {
          const el = e.currentTarget;
          // Frozen-edge shadow while fact columns scroll under the pinned identity pane.
          if (scrollX) el.classList.toggle('cf-grid-scrolled', el.scrollLeft > 0);
          // Depth under the sticky column header once rows scroll beneath it.
          el.classList.toggle('cf-grid-scrolled-y', el.scrollTop > 0);
        }
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
          {/* Sticky + frozen column header — pins to the grid scrollport top;
              opaque so virtualized rows never paint through. Frozen select/title
              cells keep sticky-left inside this band. */}
          <div
            ref={headerRef}
            data-grid-col-header=""
            className="sticky top-0 z-sticky isolate shrink-0 bg-surface-card"
          >
            {columnHeader}
          </div>
          <VirtualGroupedSections
            orderGroupsByDate={orderGroupsByDate}
            scrollParentRef={scrollParentRef ?? bodyRef}
            useAncestorScroll={useAncestorScroll}
            renderRow={renderRow}
            renderGroup={renderGroup}
            headerEstimate={headerEstimate}
            rowEstimate={rowEstimate}
            showDayHeaders={false}
          />
        </>
      )}
    </div>
  );
}
