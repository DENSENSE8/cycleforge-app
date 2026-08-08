'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import type { PickupLine } from '../pickup-lines';
import { PICKUP_TABLE_BINDING } from './pickup-table-definition';
import { PickupGridColumnHeader } from './PickupGridColumnHeader';
import { PickupGridGroupRow } from './PickupGridGroupRow';
import {
  defaultDirForPickupGridSort,
  isPickupGridSortable,
  type PickupGridColumn,
  type PickupGridColumnKey,
} from './pickup-grid-layout';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';

/** Staff-prefs identity — one pickup spreadsheet, one Fields selection. */

interface PickupGridViewProps {
  rows: PickupLine[];
  loading: boolean;
  /** Settled with no pickup orders at all. */
  emptyMessage: string;
  /** Settled with none matching the filter — a different answer (clear it). */
  searchEmptyMessage?: string;
  isSearching?: boolean;
  /** Highlight every product row of this LCPU order (sidebar selection). */
  selectedOrderId: number | null;
  onSelectOrder: (orderId: number) => void;
  /** FULL canonical column list — `LedgerGridSurface` resolves visibility. */
  columns?: readonly PickupGridColumn[];
  /**
   * Band-3 triage controls slot — when set, the column-display (▦) trigger
   * portals there beside find instead of floating on the card corner.
   */
  columnTriggerPortalTarget?: HTMLElement | null;
}

/** Group flat pickup lines under their LCPU order (the one-to-many fold key). */
function pickupFoldKey(line: PickupLine): string {
  const po = (line.po_number || '').trim();
  return po || `order:${line.order_id}`;
}

function comparePickupRows(
  a: PickupLine,
  b: PickupLine,
  key: PickupGridColumnKey,
  dir: GridSortDir,
): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (key) {
    case 'title':
      return sign * a.product_title.localeCompare(b.product_title);
    case 'sku':
      return sign * (a.sku || '').localeCompare(b.sku || '');
    case 'order':
      return sign * (a.po_number || '').localeCompare(b.po_number || '');
    case 'date':
      return sign * (a.pickup_date || '').localeCompare(b.pickup_date || '');
    case 'qty':
      return sign * (a.quantity - b.quantity);
    case 'condition':
      return sign * (a.condition_grade || '').localeCompare(b.condition_grade || '');
    case 'price':
      return sign * ((Number(a.total_price) || 0) - (Number(b.total_price) || 0));
    case 'status':
      return sign * (a.order_status || '').localeCompare(b.order_status || '');
    default:
      return 0;
  }
}

/**
 * Local Pickup spreadsheet — pickup-native adapter over {@link LedgerGridSurface}.
 * Same shell recipe as {@link ReceivingGridView} (airtable skin + scrollX +
 * click-to-sort), grouped one-to-many by LCPU order number. Read-only: the grid
 * carries none of receiving's edit/serial/receive side-effects.
 */
export function PickupGridView({
  rows,
  loading,
  emptyMessage,
  searchEmptyMessage,
  isSearching,
  selectedOrderId,
  onSelectOrder,
  columns,
  columnTriggerPortalTarget = null,
}: PickupGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Column sort is DURABLE: `?colsort=`/`?coldir=` (workbench URL-as-state law),
  // so a reload or a shared link reproduces the operator's view. Receiving mode
  // switches clear both via the route's param spec. TanStack still owns asc↔desc.
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<PickupGridColumnKey>({
    isColumn: isPickupGridSortable,
    defaultDir: defaultDirForPickupGridSort,
  });

  // One-shot "settle" re-render after the grid first has data. The virtualized
  // LedgerGrid mounts its scroll element in the same commit that data arrives;
  // its internal re-measure re-render can miss on first paint when nothing else
  // re-renders this subtree (no async label/selection churn like sibling grids
  // have), leaving the body blank until the first interaction. A rAF-deferred
  // tick after load forces exactly one extra render so the virtualizer measures
  // the now-attached scrollport and paints its rows immediately.
  const [, settleTick] = useState(0);
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (loading || !hasRows) return;
    const raf = requestAnimationFrame(() => settleTick((t) => t + 1));
    return () => cancelAnimationFrame(raf);
  }, [loading, hasRows]);

  const { orderGroupsByDate } = useMemo(() => {
    const ordered =
      columnSort && sortDir
        ? [...rows].sort((a, b) => comparePickupRows(a, b, columnSort, sortDir))
        : rows;
    const groups = groupRowsBy(ordered, pickupFoldKey);
    return {
      orderGroupsByDate: [['', groups]] as [string, RowGroup<PickupLine>[]][],
    };
  }, [rows, columnSort, sortDir]);

  return (
    <NonlinearTableHost<PickupLine, PickupGridColumnKey, PickupGridColumn>
      binding={PICKUP_TABLE_BINDING}
      columns={columns}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => String(r.id)}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={loading}
      emptyMessage={emptyMessage}
      searchEmptyMessage={searchEmptyMessage}
      isSearching={isSearching}
      scrollRef={scrollRef}
      columnTriggerPortalTarget={columnTriggerPortalTarget}
      renderColumnHeader={({ toggleColumnSort, onResizeColumn, onResetColumn, columns: visible }) => (
        <PickupGridColumnHeader
          columns={visible}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
          onResizeColumn={onResizeColumn}
        onResetColumn={onResetColumn}
        />
      )}
      renderGroup={(group, baseStripeIndex, { columns: visible }) => (
        <PickupGridGroupRow
          group={group}
          baseStripeIndex={baseStripeIndex}
          selectedOrderId={selectedOrderId}
          onSelectOrder={onSelectOrder}
          columns={visible}
        />
      )}
      renderRow={(row, stripeIndex, { columns: visible }) => (
        <PickupGridGroupRow
          group={{ key: `k:${row.id}`, rows: [row] }}
          baseStripeIndex={stripeIndex}
          selectedOrderId={selectedOrderId}
          onSelectOrder={onSelectOrder}
          columns={visible}
        />
      )}
    />
  );
}
