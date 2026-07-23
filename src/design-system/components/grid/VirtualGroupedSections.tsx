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

/**
 * `VirtualGroupedSections<T>` — DS SoT windowed renderer for date-ordered
 * ledgers (optionally day-banded). Owned by `@/design-system/components/grid`
 * and composed by {@link LedgerGrid}. Outbound spreadsheets
 * ({@link OrdersGridView} / LedgerGrid) pass `showDayHeaders={false}`: absolute
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
  | { kind: 'header'; key: string; date: string; count: number }
  | { kind: 'group'; key: string; group: RowGroup<T>; baseStripeIndex: number }
  | { kind: 'row'; key: string; record: T; stripeIndex: number };

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
  renderRow: (record: T, stripeIndex: number) => ReactNode;
  /** Grouped mode: render one order group (singleton row or multi-product fold).
   *  Required when `orderGroupsByDate` is passed. */
  renderGroup?: (group: RowGroup<T>, baseStripeIndex: number) => ReactNode;
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
const ROW_ESTIMATE = 44;

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
    if (orderGroupsByDate) {
      // One stripe slot per top-level group (collapsed multi-child = one visual
      // row). Continuous across dates when day headers are hidden so a band
      // boundary never doubles a white/gray.
      let stripeIndex = 0;
      for (const [date, groups] of orderGroupsByDate) {
        const dayTotal = groups.reduce((sum, g) => sum + g.rows.length, 0);
        if (showDayHeaders) {
          flat.push({ kind: 'header', key: `h:${date}`, date, count: dayTotal });
        }
        stripeIndex = stripeIndexForDateStart(stripeIndex, showDayHeaders);
        for (const group of groups) {
          flat.push({ kind: 'group', key: `g:${date}:${group.key}`, group, baseStripeIndex: stripeIndex });
          stripeIndex = nextGroupStripeIndex(stripeIndex);
        }
      }
    } else if (daySections) {
      let stripeIndex = 0;
      for (const [date, rows] of daySections) {
        if (showDayHeaders) {
          flat.push({ kind: 'header', key: `h:${date}`, date, count: rows.length });
        }
        stripeIndex = stripeIndexForDateStart(stripeIndex, showDayHeaders);
        rows.forEach((record, dayIndex) => {
          const key = getRowKey ? `r:${getRowKey(record, dayIndex)}` : `r:${date}:${dayIndex}`;
          flat.push({ kind: 'row', key, record, stripeIndex });
          stripeIndex += 1;
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
            // The active header pins via position:sticky (top:0); every other item
            // is absolutely positioned by the virtualizer transform. When embedded
            // in a shared ancestor scroll region, subtract `scrollMargin` to lay out
            // within this list's own wrapper (start is measured from the region top).
            className={`left-0 top-0 w-full ${pinned ? 'z-20' : header ? 'z-10' : 'z-0'}`}
            data-sticky-day={pinned ? 'true' : undefined}
            style={
              pinned
                ? { position: 'sticky', top: stickyHeaderTop }
                : { position: 'absolute', transform: `translateY(${vRow.start - scrollMargin}px)` }
            }
          >
            {item.kind === 'header' ? (
              <DateGroupHeader date={item.date} total={item.count} sticky={false} />
            ) : item.kind === 'group' ? (
              renderGroup?.(item.group, item.baseStripeIndex) ?? null
            ) : (
              renderRow(item.record, item.stripeIndex)
            )}
          </div>
        );
      })}
    </div>
  );
}
