'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LedgerGridSurface } from '@/design-system/components/grid';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import type { PickupLine } from '../pickup-lines';
import { PICKUP_GRID_DESCRIPTOR } from './pickup-grid-descriptor';
import { PickupGridColumnHeader } from './PickupGridColumnHeader';
import { PickupGridGroupRow } from './PickupGridGroupRow';
import {
  type PickupGridColumnKey,
  type PickupGridSortDir,
} from './pickup-grid-layout';

interface PickupGridViewProps {
  rows: PickupLine[];
  loading: boolean;
  emptyMessage: string;
  /** Highlight every product row of this LCPU order (sidebar selection). */
  selectedOrderId: number | null;
  onSelectOrder: (orderId: number) => void;
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
}: PickupGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columnSort, setColumnSort] = useState<PickupGridColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<PickupGridSortDir | null>(null);

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
  const handleSortChange = useCallback((key: PickupGridColumnKey, dir: PickupGridSortDir) => {
    setColumnSort(key);
    setSortDir(dir);
  }, []);

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
      descriptor={PICKUP_GRID_DESCRIPTOR}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={(r) => String(r.id)}
      sort={columnSort}
      dir={sortDir}
      onSortChange={handleSortChange}
      loading={loading}
      emptyMessage={emptyMessage}
      scrollRef={scrollRef}
      testId="pickup-grid-body"
      renderColumnHeader={({ toggleColumnSort }) => (
        <PickupGridColumnHeader
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
        />
      )}
      renderRow={(row, stripeIndex) => (
        <PickupGridGroupRow
          group={{ key: `k:${row.id}`, rows: [row] }}
          baseStripeIndex={stripeIndex}
          selectedOrderId={selectedOrderId}
          onSelectOrder={onSelectOrder}
        />
      )}
    />
  );
}
