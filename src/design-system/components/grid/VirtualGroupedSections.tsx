'use client';

import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useVirtualizer, defaultRangeExtractor, type Range } from '@tanstack/react-virtual';
import { DateGroupHeader } from '@/components/ui/DateGroupHeader';
import { useAncestorScrollMargin } from '@/hooks/useAncestorScrollMargin';
import type { RowGroup } from '@/lib/group-rows';
import {
  nextGroupStripeIndex,
  stripeIndexForDateStart,
} from '@/design-system/components/grid/group-stripe-index';
import {
  GRID_HEADER_ROW_INDEX,
  groupRowSpan,
} from '@/design-system/components/grid/grid-row-index';

/**
 * `VirtualGroupedSections<T>` — DS SoT windowed renderer for date-ordered
 * ledgers (optionally day-banded). Owned by `@/design-system/components/grid`
 * and composed by {@link LedgerGrid}. Outbound spreadsheets
 * ({@link OrdersGridHost} / LedgerGrid) pass `showDayHeaders={false}`: absolute
 * Date lives in a per-row column. Station / receiving feeds may still emit
 * sticky {@link DateGroupHeader} bands (`showDayHeaders` default true).
 *
 * A surface supplies EITHER folded order groups per day (`orderGroupsByDate`,
 * with a `renderGroup` that owns the singleton/multi-product collapse) OR a flat
 * `daySections` list (each day is just rows — testing history, station logs), and
 * a `renderRow`. Both shapes flatten into ONE linear item stream — optionally a
 * `header` per day, then either `group` items or `row` items — handed to a single
 * `useVirtualizer`, so only the items intersecting the viewport (plus overscan)
 * are in the DOM regardless of list length.
 *
 * The scroll container is caller-owned (`scrollParentRef`). When embedded in a
 * stacked SwimlaneBoard lane that shares the board's single scroll region, pass
 * `useAncestorScroll` so the virtualizer offsets its window by this list's
 * position within that region (`scrollMargin`) — via {@link useAncestorScrollMargin}.
 */

type FlatItem<T> =
  | { kind: 'header'; key: string; date: string; count: number; rowIndex: number }
  | {
      kind: 'group';
      key: string;
      group: RowGroup<T>;
      baseStripeIndex: number;
      rowIndex: number;
    }
  | { kind: 'row'; key: string; record: T; stripeIndex: number; rowIndex: number };

interface VirtualGroupedSectionsProps<T> {
  /** Date bands → folded order groups (grouped mode). Mutually exclusive with
   *  `daySections`; pass a `renderGroup` alongside. */
  orderGroupsByDate?: [string, RowGroup<T>[]][];
  /** Date bands → flat rows (flat mode — testing history, station logs). */
  daySections?: [string, T[]][];
  /** The scrolling ancestor that owns the viewport (caller-owned). */
  scrollParentRef: RefObject<HTMLElement | null>;
  /** Render one row at the given zebra-stripe index. Used directly in flat mode
   *  and threaded into `renderGroup` in grouped mode. */
  renderRow: (record: T, stripeIndex: number, rowIndex?: number) => ReactNode;
  /** Grouped mode: render one order group (singleton row or multi-product fold).
   *  Required when `orderGroupsByDate` is passed. */
  renderGroup?: (
    group: RowGroup<T>,
    baseStripeIndex: number,
    rowIndex?: number,
  ) => ReactNode;
  /** Stable identity for a flat row (defaults to its index within the stream —
   *  pass a real id so windowing survives re-sorts without remounting). */
  getRowKey?: (record: T, dayIndex: number) => string;
  /** When the `scrollParentRef` is an ancestor shared with sibling lists, offset
   *  the virtualizer window (`scrollMargin`). Off (0 margin) → self-scrolling body. */
  useAncestorScroll?: boolean;
  /** First-paint size estimates; real heights measured on mount. */
  headerEstimate?: number;
  rowEstimate?: number;
  /** Row `getRowKey` value to scroll into view (deep-link / keyboard focus). The
   *  virtualizer scrolls to that item whenever this changes — works even when the
   *  target isn't currently windowed (unlike a DOM `scrollIntoView`). */
  scrollToKey?: string | null;
  /**
   * CSS `top` for the pinned day-band header (default `'0'`). A ledger/spreadsheet
   * shell that renders its own sticky column header ABOVE this list passes the
   * header's measured height (e.g. `var(--cf-grid-header-h)`) so day bands dock
   * directly beneath it instead of colliding at `top:0`. Ignored when
   * `showDayHeaders` is false.
   */
  stickyHeaderTop?: string;
  /**
   * When true (default), emit a sticky {@link DateGroupHeader} per day.
   * When false, flatten to groups/rows only — Pending Grid Date column replaces
   * floating day chrome.
   */
  showDayHeaders?: boolean;
}

const HEADER_ESTIMATE = 36;
/** Leaf/summary row estimate — Receiving golden is `h-10` (40); measureElement corrects per surface. */
const ROW_ESTIMATE = 40;

export function VirtualGroupedSections<T>({
  orderGroupsByDate,
  daySections,
  scrollParentRef,
  renderRow,
  renderGroup,
  getRowKey,
  useAncestorScroll = false,
  headerEstimate = HEADER_ESTIMATE,
  rowEstimate = ROW_ESTIMATE,
  scrollToKey,
  stickyHeaderTop = '0',
  showDayHeaders = true,
}: VirtualGroupedSectionsProps<T>) {
  const items = useMemo<FlatItem<T>[]>(() => {
    const flat: FlatItem<T>[] = [];
    // ARIA row numbering runs alongside the zebra-stripe walk. It counts every
    // row the grid COULD show (folds treated as expanded) so a collapse never
    // renumbers the table — see grid-row-index.ts. Row 1 is the column header.
    let rowIndex = GRID_HEADER_ROW_INDEX + 1;
    if (orderGroupsByDate) {
      // One stripe slot per top-level group (collapsed multi-child = one visual
      // row). Continuous across dates when day headers are hidden so a band
      // boundary never doubles a white/gray.
      let stripeIndex = 0;
      for (const [date, groups] of orderGroupsByDate) {
        const dayTotal = groups.reduce((sum, g) => sum + g.rows.length, 0);
        if (showDayHeaders) {
          flat.push({ kind: 'header', key: `h:${date}`, date, count: dayTotal, rowIndex });
          rowIndex += 1;
        }
        stripeIndex = stripeIndexForDateStart(stripeIndex, showDayHeaders);
        for (const group of groups) {
          flat.push({
            kind: 'group',
            key: `g:${date}:${group.key}`,
            group,
            baseStripeIndex: stripeIndex,
            rowIndex,
          });
          rowIndex += groupRowSpan(group);
          stripeIndex = nextGroupStripeIndex(stripeIndex);
        }
      }
    } else if (daySections) {
      let stripeIndex = 0;
      for (const [date, rows] of daySections) {
        if (showDayHeaders) {
          flat.push({ kind: 'header', key: `h:${date}`, date, count: rows.length, rowIndex });
          rowIndex += 1;
        }
        stripeIndex = stripeIndexForDateStart(stripeIndex, showDayHeaders);
        rows.forEach((record, dayIndex) => {
          const key = getRowKey ? `r:${getRowKey(record, dayIndex)}` : `r:${date}:${dayIndex}`;
          flat.push({ kind: 'row', key, record, stripeIndex, rowIndex });
          rowIndex += 1;
        });
      }
    }
    return flat;
  }, [orderGroupsByDate, daySections, getRowKey, showDayHeaders]);

  // Indices of the day-band headers — candidates for the sticky pin.
  const stickyIndexes = useMemo(
    () =>
      showDayHeaders
        ? items.reduce<number[]>((acc, it, i) => (it.kind === 'header' ? (acc.push(i), acc) : acc), [])
        : [],
    [items, showDayHeaders],
  );

  // The header currently pinned to the top of the viewport, updated inside
  // `rangeExtractor` (runs on every scroll) so the visible day's label stays stuck.
  const activeStickyIndexRef = useRef(0);

  // Stacked-lane case: window against a shared ancestor scroll region (see V0).
  const innerRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useAncestorScrollMargin({
    enabled: useAncestorScroll,
    scrollParentRef,
    innerRef,
    deps: [items],
  });

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => (items[index].kind === 'header' ? headerEstimate : rowEstimate),
    overscan: 10,
    getItemKey: (index) => items[index].key,
    rangeExtractor: useCallback(
      (range: Range) => {
        if (!showDayHeaders || stickyIndexes.length === 0) {
          return defaultRangeExtractor(range);
        }
        const active = [...stickyIndexes].reverse().find((i) => range.startIndex >= i) ?? 0;
        activeStickyIndexRef.current = active;
        const next = new Set([active, ...defaultRangeExtractor(range)]);
        return [...next].sort((a, b) => a - b);
      },
      [stickyIndexes, showDayHeaders],
    ),
    scrollMargin,
  });

  // Deep-link / keyboard focus: scroll the target row into view even when it is
  // outside the current window (DOM scrollIntoView can't reach an unmounted row).
  useEffect(() => {
    if (!scrollToKey) return;
    const idx = items.findIndex((it) => it.key === `r:${scrollToKey}`);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' });
    // Intentionally keyed on `scrollToKey` only — scroll on focus/deep-link change,
    // not on every data re-render (which would fight the user's scroll position).
  }, [scrollToKey]);

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div ref={innerRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualRows.map((vRow) => {
        const item = items[vRow.index];
        const header = item.kind === 'header';
        const pinned = header && activeStickyIndexRef.current === vRow.index;
        return (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            // Positioning shell only. `role="table"` requires row/rowgroup
            // children, and a generic div between them breaks that chain — so
            // this wrapper is removed from the a11y tree and the real row /
            // rowgroup roles live on the rendered content itself.
            role="presentation"
            // The active header pins via position:sticky; every other item is
            // absolutely positioned with `top` (not `transform: translateY`).
            // Transform creates a containing block that breaks sticky-left frozen
            // cells (select pane) — they jitter/bounce while Y-scrolling. TanStack
            // Virtual's position mode uses top/left for the same reason. When
            // embedded in a shared ancestor scroll region, subtract `scrollMargin`
            // to lay out within this list's own wrapper.
            className={`left-0 w-full ${pinned ? 'z-20' : header ? 'z-10' : 'z-0'}`}
            data-sticky-day={pinned ? 'true' : undefined}
            style={
              pinned
                ? { position: 'sticky', top: stickyHeaderTop }
                : { position: 'absolute', top: vRow.start - scrollMargin }
            }
          >
            {item.kind === 'header' ? (
              <DateGroupHeader
                date={item.date}
                total={item.count}
                sticky={false}
                rowIndex={item.rowIndex}
              />
            ) : item.kind === 'group' ? (
              renderGroup?.(item.group, item.baseStripeIndex, item.rowIndex) ?? null
            ) : (
              renderRow(item.record, item.stripeIndex, item.rowIndex)
            )}
          </div>
        );
      })}
    </div>
  );
}
