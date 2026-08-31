'use client';

import { useMemo } from 'react';
import { getCurrentPSTDateKey, toPSTDateKey } from '@/utils/date';
import { flattenRenderOrder, groupRowsBy, type RowGroup } from '@/lib/group-rows';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import {
  defaultDirForQueueSort,
  isQueueColumnSort,
  type QueueDisplaySortDir,
} from '@/utils/queue-display-sort';
import {
  isShippedByLatestStatus,
  queueRowBandDateSource,
  type OrdersQueueMode,
  type OrdersQueueSort,
  type QueueRowRecord,
} from './helpers';
import { compareQueueColumnRows } from './queue-row-compare';

/**
 * Band key for the day's intake section.
 *
 * A key, not the label — band keys elsewhere in `orderGroupsByDate` are PST
 * date keys, and a human string sitting among them is what let the old
 * `'Just added'` band read as a date to anything that parsed keys. The label
 * the operator sees is {@link ADDED_TODAY_LABEL}, supplied to the grid through
 * `sectionHeaders`, so the key can stay opaque.
 */
export const ADDED_TODAY_BAND = '__added_today__';

/** Section caption for {@link ADDED_TODAY_BAND}. Sentence case (operator, 2026-08-31). */
export const ADDED_TODAY_LABEL = 'Added today';

export interface OrdersQueueRows {
  /** Records still in the queue (already-shipped rows filtered out). */
  visibleRecords: ShippedOrder[];
  /**
   * Date bands → folded order groups, in canonical render order — a
   * `GroupedRenderOrder<ShippedOrder>` in all but its declared (mutable) type,
   * which it keeps because it flows straight into `LedgerGrid`'s mutable prop.
   * (Mutable → readonly is assignable; the reverse is not, so the readonly alias
   * belongs on the consumer, not here.)
   *
   * Group keys are **band-local** by design (`order_id`, or `id:<n>`), so a
   * multi-line order whose lines straddle two date bands lands one group per
   * band under the same key. Do not band-qualify them here: fold identity is
   * minted exactly once, by `foldKey(bandKey, group.key)` in `group-rows.ts`,
   * and a second encoding would mean a `revealFoldKey` produced by one is never
   * `.has()`-equal to a set built by the other — the reveal silently no-ops and
   * the record opens behind a still-closed fold.
   */
  orderGroupsByDate: [string, RowGroup<ShippedOrder>[]][];
  /**
   * The FOLD-BLIND flat leaf order — every group treated as expanded.
   *
   * It is **not** "what is on screen", and it must not be narrowed to that. Its
   * three consumers all need the full set: `useGridSurface` (the TanStack row
   * model), `useTableSelectMode` (shift-range select — narrowing would make a
   * range across a collapsed order skip its lines), and the queue selection's
   * seen-in-this-queue guard. "Which record can the operator see, and what does
   * ↓ open" is a different question, answered by `resolveRecordCursor`
   * (`src/lib/record-cursor/cursor-model.ts`), which is fold-blind for its own
   * reason: a step into a collapsed fold REVEALS it rather than skipping it, so
   * every record is reachable.
   */
  displayedRecords: ShippedOrder[];
  /** Count of dated, visible records. */
  totalCount: number;
}

export interface UseOrdersQueueRowsOptions {
  records: ShippedOrder[];
  sort: OrdersQueueSort;
  /** Column-sort direction; ignored for composite / legacy modes. */
  dir?: QueueDisplaySortDir | null;
  queueMode: OrdersQueueMode;
}

/**
 * Derives the date-banded (or flat column-sorted), order-grouped view of the
 * queue from the raw records. Filters already-shipped rows, bands by
 * deadline/created date (composites) or sorts globally (column sorts), then
 * folds lines that share an order number into one group.
 *
 * `displayedRecords` is flattened from the SAME grouped order — via
 * `flattenRenderOrder`, the one implementation of that walk — so the row model
 * and a shift-range select can never disagree with the render order about which
 * rows lie between two clicks.
 *
 * It is deliberately **fold-blind**. The docblock here used to claim it "lines
 * up with exactly what's on screen"; it never did (`QueueGroupRow` collapses a
 * multi-line order while this walk keeps all of its children), and reading it
 * as the visible order is what let ↓ step three times into rows nobody could
 * see — plan §2.2. See `OrdersQueueRows.displayedRecords` for who needs the
 * full set and who answers the visible-order question instead.
 */
export function useOrdersQueueRows({
  records,
  sort,
  dir = null,
  queueMode,
}: UseOrdersQueueRowsOptions): OrdersQueueRows {
  return useMemo(() => {
    const visibleRecords = records.filter((record) => !isShippedByLatestStatus(record));

    // The day's intake, as its own section at the top of the queue. The window
    // was 30 minutes and unlabelled — invisible, because the outbound
    // spreadsheet renders no band keys (`showDayHeaders={false}`). A civil PST
    // day is the window the operator actually asks for ("what came in today"),
    // it survives a reload the way a rolling clock window cannot, and it reads
    // the same whether the order arrived by Sheets sync, CSV or hand entry —
    // one word covers every intake path, which is why this is not "imported".
    const todayKey = getCurrentPSTDateKey();
    const isAddedToday = (record: ShippedOrder) => {
      if (record.created_at) {
        try {
          return toPSTDateKey(record.created_at) === todayKey;
        } catch {
          return false;
        }
      }
      // A row with NO date at all has no band to fall into — the banding walk
      // below drops it when `queueRowBandDateSource` returns null. It rides
      // here so it stays visible, as it did under the old window. In practice
      // it is a just-inserted row whose `created_at` missed the projection.
      return !record.deadline_at && !record.ship_by_date;
    };

    const addedToday =
      queueMode === 'fulfillment'
        ? visibleRecords.filter(isAddedToday).sort((a, b) => Number(b.id) - Number(a.id))
        : [];
    const bandRecords =
      addedToday.length > 0
        ? visibleRecords.filter((record) => !addedToday.some((row) => Number(row.id) === Number(record.id)))
        : visibleRecords;

    // Column sorts: one flat global order (single synthetic band — LedgerGrid
    // hides day headers). Include rows even when ship-by/created is missing.
    if (isQueueColumnSort(sort)) {
      const resolvedDir = dir ?? defaultDirForQueueSort(sort) ?? 'asc';
      const sorted = [...visibleRecords].sort((a, b) =>
        compareQueueColumnRows(a, b, sort, resolvedDir),
      );
      const groups = groupRowsBy(sorted, (r) => String(r.order_id || '').trim() || `id:${r.id}`);
      const orderGroupsByDate: [string, RowGroup<ShippedOrder>[]][] = [['', groups]];
      const displayedRecords = flattenRenderOrder(orderGroupsByDate);
      return {
        visibleRecords,
        orderGroupsByDate,
        displayedRecords,
        totalCount: sorted.length,
      };
    }

    const groupedRecords: Record<string, ShippedOrder[]> = {};
    bandRecords.forEach((record) => {
      // `newest` bands by when the order was added; otherwise by its deadline.
      const dateSource = queueRowBandDateSource(record, sort);
      if (!dateSource) return;

      let date = '';
      try {
        date = toPSTDateKey(dateSource) || 'Unknown';
      } catch {
        date = 'Unknown';
      }

      if (!groupedRecords[date]) groupedRecords[date] = [];
      groupedRecords[date].push(record);
    });

    // One canonical per-day ordering, shared by the rendered rows AND the flat
    // `displayedRecords` (row model, awaiting worklist, shift-range select) so
    // the range a shift-click spans matches the order the grid paints.
    const deadlineTime = (r: ShippedOrder) => new Date(r.deadline_at || r.created_at || 0).getTime();
    const sortDayRecords = (dayRecords: ShippedOrder[]): ShippedOrder[] =>
      [...dayRecords].sort((a, b) => {
        if (sort === 'newest') {
          const ta = new Date(a.created_at || a.deadline_at || 0).getTime();
          const tb = new Date(b.created_at || b.deadline_at || 0).getTime();
          return tb - ta;
        }
        // `deadline` is pure soonest-deadline (most overdue) first — no
        // tested-before-pending grouping. `priority` keeps that grouping.
        if (sort === 'priority' && queueMode === 'fulfillment') {
          const testedA = Boolean((a as QueueRowRecord).has_tech_scan) ? 0 : 1;
          const testedB = Boolean((b as QueueRowRecord).has_tech_scan) ? 0 : 1;
          if (testedA !== testedB) return testedA - testedB;
        }
        return deadlineTime(a) - deadlineTime(b);
      });

    const sortedGroupedEntries = Object.entries(groupedRecords)
      // `newest` shows the most recent day band first; `priority` shows soonest.
      .sort((a, b) => (sort === 'newest' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])))
      .map(([date, dayRecords]) => [date, sortDayRecords(dayRecords)] as [string, ShippedOrder[]]);

    // Within each day, fold the lines that share ONE order number into a single
    // group → a multi-product order renders as one expandable header; the common
    // single-line case stays a plain row. groupRowsBy preserves the per-day sort
    // order.
    const orderGroupsByDate: [string, RowGroup<ShippedOrder>[]][] = [
      ...(addedToday.length > 0
        ? ([
            [
              ADDED_TODAY_BAND,
              groupRowsBy(addedToday, (r) => String(r.order_id || '').trim() || `id:${r.id}`),
            ],
          ] as [string, RowGroup<ShippedOrder>[]][])
        : []),
      ...sortedGroupedEntries.map(
        ([date, dayRecords]) =>
          [
            date,
            groupRowsBy(dayRecords, (r) => String(r.order_id || '').trim() || `id:${r.id}`),
          ] as [string, RowGroup<ShippedOrder>[]],
      ),
    ];

    const displayedRecords = flattenRenderOrder(orderGroupsByDate);

    const totalCount =
      addedToday.length +
      Object.values(groupedRecords).reduce((sum, dayRecords) => sum + dayRecords.length, 0);

    return { visibleRecords, orderGroupsByDate, displayedRecords, totalCount };
  }, [records, sort, dir, queueMode]);
}
