'use client';

import { useMemo } from 'react';
import { toPSTDateKey } from '@/utils/date';
import { flattenRenderOrder, groupRowsBy, type RowGroup } from '@/lib/group-rows';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import {
  defaultDirForQueueSort,
  isQueueColumnSort,
  type QueueDisplaySortDir,
} from '@/utils/queue-display-sort';
import {
  queueRowBandDateSource,
  type OrdersQueueMode,
  type OrdersQueueSort,
} from './helpers';
import { compareQueueColumnRows, compareUrgentPin } from './queue-row-compare';

export interface OrdersQueueRows {
  /** Feed rows this mount was given — the table paints all of them. */
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
  /** Leaf count of {@link displayedRecords} — same number the pager totals. */
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
 * Date-banded (or flat column-sorted), order-grouped view of the queue.
 * Every feed row is painted. Missing ship-by/created lands in `Unknown`.
 */
export function buildOrdersQueueRows({
  records,
  sort,
  dir = null,
  queueMode,
}: UseOrdersQueueRowsOptions): OrdersQueueRows {
  const visibleRecords = records;

  if (isQueueColumnSort(sort)) {
    const resolvedDir = dir ?? defaultDirForQueueSort(sort) ?? 'asc';
    const sorted = [...visibleRecords].sort((a, b) =>
      compareQueueColumnRows(a, b, sort, resolvedDir, queueMode),
    );
    const groups = groupRowsBy(sorted, (r) => String(r.order_id || '').trim() || `id:${r.id}`);
    const orderGroupsByDate: [string, RowGroup<ShippedOrder>[]][] = [['', groups]];
    const displayedRecords = flattenRenderOrder(orderGroupsByDate);
    return {
      visibleRecords,
      orderGroupsByDate,
      displayedRecords,
      totalCount: displayedRecords.length,
    };
  }

  const deadlineTime = (r: ShippedOrder) => new Date(r.deadline_at || r.created_at || 0).getTime();
  const urgentRecords = visibleRecords
    .filter((record) => Boolean(record.is_urgent))
    .sort((a, b) => deadlineTime(a) - deadlineTime(b));
  const urgentIds = new Set(urgentRecords.map((record) => Number(record.id)));
  const bandRecords = visibleRecords.filter((record) => !urgentIds.has(Number(record.id)));

  const groupedRecords: Record<string, ShippedOrder[]> = {};
  bandRecords.forEach((record) => {
    const dateSource = queueRowBandDateSource(record, sort);
    let date = 'Unknown';
    if (dateSource) {
      try {
        date = toPSTDateKey(dateSource) || 'Unknown';
      } catch {
        date = 'Unknown';
      }
    }
    if (!groupedRecords[date]) groupedRecords[date] = [];
    groupedRecords[date].push(record);
  });

  const sortDayRecords = (dayRecords: ShippedOrder[]): ShippedOrder[] =>
    [...dayRecords].sort((a, b) => {
      const pin = compareUrgentPin(a, b);
      if (pin !== 0) return pin;
      if (sort === 'newest') {
        const ta = new Date(a.created_at || a.deadline_at || 0).getTime();
        const tb = new Date(b.created_at || b.deadline_at || 0).getTime();
        return tb - ta;
      }
      return deadlineTime(a) - deadlineTime(b);
    });

  const sortedGroupedEntries = Object.entries(groupedRecords)
    .sort((a, b) => (sort === 'newest' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])))
    .map(([date, dayRecords]) => [date, sortDayRecords(dayRecords)] as [string, ShippedOrder[]]);

  const foldKey = (r: ShippedOrder) => String(r.order_id || '').trim() || `id:${r.id}`;
  const orderGroupsByDate: [string, RowGroup<ShippedOrder>[]][] = [
    ...(urgentRecords.length > 0
      ? ([['__urgent__', groupRowsBy(urgentRecords, foldKey)]] as [string, RowGroup<ShippedOrder>[]][])
      : []),
    ...sortedGroupedEntries.map(
      ([date, dayRecords]) =>
        [date, groupRowsBy(dayRecords, foldKey)] as [string, RowGroup<ShippedOrder>[]],
    ),
  ];

  const displayedRecords = flattenRenderOrder(orderGroupsByDate);
  return { visibleRecords, orderGroupsByDate, displayedRecords, totalCount: displayedRecords.length };
}

export function useOrdersQueueRows(options: UseOrdersQueueRowsOptions): OrdersQueueRows {
  return useMemo(() => buildOrdersQueueRows(options), [options.records, options.sort, options.dir, options.queueMode]);
}
