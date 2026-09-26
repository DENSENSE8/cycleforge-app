'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useVirtualizer, defaultRangeExtractor, type Range } from '@tanstack/react-virtual';
import { DateGroupHeader } from '@/components/ui/DateGroupHeader';
import { GridSectionHeader } from '@/design-system/components/grid/GridSectionHeader';
import { cn } from '@/utils/_cn';
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
import {
  LEDGER_GRID_HEADER_ESTIMATE_PX,
  LEDGER_GRID_OVERSCAN,
  LEDGER_GRID_ROW_ESTIMATE_PX,
} from '@/design-system/components/grid/grid-paint';
import { slotTableScrollItemMatches } from '@/lib/tables/slot-table-find';
import {
  compoundRowDetailEstimatePx,
  subscribeCompoundRowDetailOpen,
} from '@/components/tables/compound/useCompoundRowDetail';

/**
 * `VirtualGroupedSections<T>` — DS SoT windowed renderer for date-ordered
 * ledgers (optionally day-banded). Owned by `@/design-system/components/grid`
 * and composed by {@link LedgerGrid}. Outbound spreadsheets
 * (`useOrdersSpreadsheet` / LedgerGrid) pass `showDayHeaders={false}`: absolute
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

/**
 * Where an item sits in a labelled section's outline. `undefined` = not in a
 * section, which is every item on a surface that passes no `sectionHeaders`.
 * The virtualizer positions each row absolutely, so a section cannot be a box —
 * the edges are painted per item instead.
 */
type SectionEdge = 'inner' | 'last';

type FlatItem<T> =
  | {
      kind: 'header';
      key: string;
      date: string;
      count: number;
      rowIndex: number;
      /** Set on a SECTION band — renders {@link GridSectionHeader}, not a date. */
      label?: string;
    }
  | {
      kind: 'group';
      key: string;
      group: RowGroup<T>;
      baseStripeIndex: number;
      rowIndex: number;
      section?: SectionEdge;
    }
  | {
      kind: 'row';
      key: string;
      record: T;
      stripeIndex: number;
      rowIndex: number;
      section?: SectionEdge;
    };

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
  /**
   * Per-item first-paint size. Use when a leaf can expand (compound detail band
   * → 96px). Falls back to {@link rowEstimate} / headerEstimate by kind.
   * `measureElement` still corrects after paint.
   */
  estimateItemSize?: (args: {
    key: string;
    kind: 'header' | 'group' | 'row';
    index: number;
  }) => number;
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
  /**
   * Band key → SECTION label. A band listed here renders an in-flow
   * {@link GridSectionHeader} and an outline around its rows, independent of
   * `showDayHeaders` — that flag governs CIVIL DAY bands (the only sticky
   * pin), and a surface with a per-row Date column (the outbound spreadsheet)
   * keeps it off while still fencing off "Added today".
   *
   * Section bands must not join the sticky pin: on ancestor page-Y desks they
   * would dock under the column header for the whole queue. They stay in the
   * virtualizer stream and are only on screen while that run of rows is.
   *
   * Keys not present here are unaffected, so a surface can name one band and
   * leave the rest of the table exactly as it was.
   */
  sectionHeaders?: Record<string, string>;
}

const HEADER_ESTIMATE = LEDGER_GRID_HEADER_ESTIMATE_PX;
/** Leaf/summary row estimate — Receiving golden is `h-10` (40); measureElement corrects per surface. */
const ROW_ESTIMATE = LEDGER_GRID_ROW_ESTIMATE_PX;

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
  estimateItemSize,
  scrollToKey,
  stickyHeaderTop = '0',
  showDayHeaders = true,
  sectionHeaders,
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
        const sectionLabel = sectionHeaders?.[date];
        const banded = sectionLabel !== undefined || showDayHeaders;
        if (banded) {
          flat.push({
            kind: 'header',
            key: `h:${date}`,
            date,
            count: dayTotal,
            rowIndex,
            ...(sectionLabel !== undefined ? { label: sectionLabel } : {}),
          });
          rowIndex += 1;
        }
        // A named section starts a clean stripe run for the same reason a day
        // band does — the outline makes it a visually separate block.
        stripeIndex = stripeIndexForDateStart(stripeIndex, banded);
        groups.forEach((group, groupIndex) => {
          flat.push({
            kind: 'group',
            key: `g:${date}:${group.key}`,
            group,
            baseStripeIndex: stripeIndex,
            rowIndex,
            ...(sectionLabel !== undefined
              ? { section: groupIndex === groups.length - 1 ? ('last' as const) : ('inner' as const) }
              : {}),
          });
          rowIndex += groupRowSpan(group);
          stripeIndex = nextGroupStripeIndex(stripeIndex);
        });
      }
    } else if (daySections) {
      let stripeIndex = 0;
      for (const [date, rows] of daySections) {
        const sectionLabel = sectionHeaders?.[date];
        const banded = sectionLabel !== undefined || showDayHeaders;
        if (banded) {
          flat.push({
            kind: 'header',
            key: `h:${date}`,
            date,
            count: rows.length,
            rowIndex,
            ...(sectionLabel !== undefined ? { label: sectionLabel } : {}),
          });
          rowIndex += 1;
        }
        stripeIndex = stripeIndexForDateStart(stripeIndex, banded);
        rows.forEach((record, dayIndex) => {
          const key = getRowKey ? `r:${getRowKey(record, dayIndex)}` : `r:${date}:${dayIndex}`;
          flat.push({
            kind: 'row',
            key,
            record,
            stripeIndex,
            rowIndex,
            ...(sectionLabel !== undefined
              ? { section: dayIndex === rows.length - 1 ? ('last' as const) : ('inner' as const) }
              : {}),
          });
          rowIndex += 1;
        });
      }
    }
    return flat;
  }, [orderGroupsByDate, daySections, getRowKey, showDayHeaders, sectionHeaders]);

  // Civil DAY headers only — candidates for the sticky pin. Named section
  // bands (`label`) stay in-flow so "Added today" cannot dock as a second
  // chrome row under the column header for the rest of the queue.
  const stickyIndexes = useMemo(
    () =>
      items.reduce<number[]>(
        (acc, it, i) =>
          (it.kind === 'header' && it.label === undefined ? (acc.push(i), acc) : acc),
        [],
      ),
    [items],
  );

  // Re-estimate when a compound leaf detail band opens/closes (48 → 96).
  const [detailEpoch, setDetailEpoch] = useState(0);
  useEffect(() => subscribeCompoundRowDetailOpen(() => setDetailEpoch((n) => n + 1)), []);

  // The header currently pinned to the top of the viewport, updated inside
  // `rangeExtractor` (runs on every scroll) so the visible day's label stays stuck.
  const activeStickyIndexRef = useRef(-1);

  // Stacked-lane case: window against a shared ancestor scroll region (see V0).
  const innerRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useAncestorScrollMargin({
    enabled: useAncestorScroll,
    scrollParentRef,
    innerRef,
    deps: [items, detailEpoch],
  });

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => {
      void detailEpoch;
      const item = items[index];
      if (estimateItemSize) {
        return estimateItemSize({
          key: item.key,
          kind: item.kind,
          index,
        });
      }
      if (item.kind === 'header') return headerEstimate;
      return compoundRowDetailEstimatePx(item.key, rowEstimate);
    },
    overscan: LEDGER_GRID_OVERSCAN,
    getItemKey: (index) => items[index].key,
    rangeExtractor: useCallback(
      (range: Range) => {
        if (stickyIndexes.length === 0) {
          activeStickyIndexRef.current = -1;
          return defaultRangeExtractor(range);
        }
        const active = [...stickyIndexes].reverse().find((i) => range.startIndex >= i);
        if (active == null) {
          activeStickyIndexRef.current = -1;
          return defaultRangeExtractor(range);
        }
        activeStickyIndexRef.current = active;
        const next = new Set([active, ...defaultRangeExtractor(range)]);
        return [...next].sort((a, b) => a - b);
      },
      [stickyIndexes],
    ),
    scrollMargin,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [detailEpoch, virtualizer]);

  // Deep-link / keyboard focus: scroll the target row into view even when it is
  // outside the current window (DOM scrollIntoView can't reach an unmounted row).
  // `auto`, not `center`: a row already on screen must not move the list — an
  // opened record would otherwise re-centre the list under it, and the staffer
  // closes the record onto a different scroll than the one they left.
  useEffect(() => {
    if (!scrollToKey) return;
    const idx = items.findIndex((it) => {
      if (it.kind === 'header') return false;
      if (it.kind === 'row') {
        const id =
          it.record && typeof it.record === 'object' && 'id' in it.record
            ? String(it.record.id)
            : undefined;
        return slotTableScrollItemMatches(scrollToKey, {
          key: it.key,
          rowIds: id ? [id] : undefined,
        });
      }
      const rowIds = it.group.rows.flatMap((record) => {
        if (record && typeof record === 'object' && 'id' in record) {
          return [String(record.id)];
        }
        return [];
      });
      return slotTableScrollItemMatches(scrollToKey, {
        key: it.key,
        groupKey: it.group.key,
        rowIds,
      });
    });
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' });
  }, [scrollToKey]);

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div ref={innerRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualRows.map((vRow) => {
        const item = items[vRow.index];
        const header = item.kind === 'header';
        const pinned =
          header &&
          item.label === undefined &&
          activeStickyIndexRef.current === vRow.index;
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
            className={cn(
              'left-0 w-full',
              pinned ? 'z-20' : header ? 'z-10' : 'z-0',
              // A virtualized row cannot live inside a bordered box, so the
              // section's outline is painted edge by edge: the header owns top
              // + sides, every row continues the sides, the last closes it.
              item.kind !== 'header' && item.section && 'border-x border-border-soft',
              item.kind !== 'header' && item.section === 'last' && 'border-b border-border-soft',
            )}
            data-sticky-day={pinned ? 'true' : undefined}
            style={
              pinned
                ? { position: 'sticky', top: stickyHeaderTop }
                : { position: 'absolute', top: vRow.start - scrollMargin }
            }
          >
            {item.kind === 'header' ? (
              item.label !== undefined ? (
                <GridSectionHeader
                  label={item.label}
                  total={item.count}
                  rowIndex={item.rowIndex}
                />
              ) : (
                <DateGroupHeader
                  date={item.date}
                  total={item.count}
                  sticky={false}
                  rowIndex={item.rowIndex}
                />
              )
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
