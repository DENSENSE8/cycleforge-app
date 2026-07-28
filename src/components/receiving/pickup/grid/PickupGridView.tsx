'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LedgerGridSurface, useGridColumnVisibility } from '@/design-system/components/grid';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import type { PickupLine } from '../pickup-lines';
import { makePickupGridDescriptor } from './pickup-grid-descriptor';
import { PickupGridColumnHeader } from './PickupGridColumnHeader';
import { PickupGridGroupRow } from './PickupGridGroupRow';
import {
  PICKUP_GRID_COLUMNS,
  defaultDirForPickupGridSort,
  isPickupGridSortable,
  type PickupGridColumn,
  type PickupGridColumnKey,
  type PickupGridSortDir,
} from './pickup-grid-layout';

/** Staff-prefs identity — one pickup spreadsheet, one Fields selection. */
const PICKUP_TABLE_ID = 'pickup' as const;

interface PickupGridViewProps {
  rows: PickupLine[];
  loading: boolean;
  emptyMessage: string;
  /** Highlight every product row of this LCPU order (sidebar selection). */
  selectedOrderId: number | null;
  onSelectOrder: (orderId: number) => void;
  /** FULL canonical column list — visibility is resolved here, not by callers. */
  columns?: readonly PickupGridColumn[];
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
  dir: PickupGridSortDir,
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
  selectedOrderId,
  onSelectOrder,
  columns = PICKUP_GRID_COLUMNS,
}: PickupGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Column sort is DURABLE: `?colsort=`/`?coldir=` (workbench URL-as-state law),
  // so a reload or a shared link reproduces the operator's view. Receiving mode
  // switches clear both via MODE_SCOPED_PARAMS. TanStack still owns asc↔desc.
  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<PickupGridColumnKey>({
    isColumn: isPickupGridSortable,
    defaultDir: defaultDirForPickupGridSort,
  });

  // ONE visibility resolution: descriptor default tier + this staffer's delta.
  // Header, rows and the grid template all read `visible` — a hidden column
  // loses its TRACK rather than rendering an empty ruled cell.
  const { columns: visible } = useGridColumnVisibility<PickupGridColumn>({
    columns,
    tableId: PICKUP_TABLE_ID,
  });

  const descriptor = useMemo(() => makePickupGridDescriptor(visible), [visible]);

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
    <LedgerGridSurface<PickupLine, PickupGridColumnKey>
      ariaLabel="Local pickup order lines"
      descriptor={descriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => String(r.id)}
      sort={columnSort}
      dir={sortDir}
      onSortChange={setSort}
      loading={loading}
      emptyMessage={emptyMessage}
      scrollRef={scrollRef}
      testId="pickup-grid-body"
      renderColumnHeader={({ toggleColumnSort }) => (
        <PickupGridColumnHeader
          columns={visible}
          activeSort={columnSort}
          sortDir={sortDir}
          onSortColumn={toggleColumnSort}
        />
      )}
      renderGroup={(group, baseStripeIndex) => (
        <PickupGridGroupRow
          group={group}
          baseStripeIndex={baseStripeIndex}
          selectedOrderId={selectedOrderId}
          onSelectOrder={onSelectOrder}
          columns={visible}
        />
      )}
      renderRow={(row, stripeIndex) => (
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
