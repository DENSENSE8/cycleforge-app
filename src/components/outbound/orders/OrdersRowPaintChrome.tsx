'use client';

/**
 * To-ship triage paint — paint-bucket left of List|Drill (Unbox History parity).
 * Applies GRID_HIGHLIGHT_PRESETS to bulk-selected order rows.
 */

import { useMemo } from 'react';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import {
  GridRowPaintTrigger,
  useGridRowFills,
} from '@/design-system/components/grid';
import { useTableSelection } from '@/hooks/useTableSelection';

export function OrdersRowPaintChrome({ className }: { className?: string }) {
  const selectedRows = useTableSelection<{ id?: number | string }>(
    DASHBOARD_ORDERS_SELECTION_SCOPE,
    (r) => Number(r.id),
  );
  const selectedIds = useMemo(
    () => new Set(selectedRows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id))),
    [selectedRows],
  );
  const { fillsById, paintRows } = useGridRowFills('orders');

  return (
    <div className={className} data-orders-paint-chrome="">
      <GridRowPaintTrigger
        selectedIds={selectedIds}
        fillsById={fillsById}
        onPaint={paintRows}
      />
    </div>
  );
}
