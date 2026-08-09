'use client';

/**
 * Unshipped · Pending Grid — To Ship fulfillment queue as a single connected
 * spreadsheet (`OrdersGridHost` → `LedgerGridSurface` `surface="sheet"`).
 * Board|Grid switcher retired; search uses the same grid surface (filtered records).
 *
 * Workbench contract: URL-addressable selection (`?openOrderId`) + right-pane
 * detail. Do not refactor onto SidebarRailShell (single-list rail engine).
 *
 * Scroll: KPI strip is pinned in `DashboardOrdersView` sheet chrome; the
 * table host is a flex-fill `WORKBENCH_SHEET_HOST` inside a definite flex chain
 * (Unbox golden) so the grid self-scrolls — one Y port, no absolute viewport
 * calc. Column header sticks inside the grid; no page-level sticky.
 */

import { useState } from 'react';
import { OrdersGridHost } from '@/components/dashboard/orders-queue/OrdersGridHost';
import { WORKBENCH_SHEET_HOST } from '@/components/dashboard/workbench-shell';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { dispatchCloseShippedDetails } from '@/utils/events';
import { useEventBridge } from '@/hooks';
import type { ShippedOrder } from '@/types/orders';

export interface UnshippedShelfBoardProps {
  records: ShippedOrder[];
  loading: boolean;
  searchValue: string;
  onOpenRecord: (record: ShippedOrder) => void;
  onClearSearch: () => void;
  searchEmptyTitle?: string;
  searchResultLabel?: string;
  clearSearchLabel?: string;
  selectMode?: boolean;
  /** Rail-selection model: the check-set is the single selection SoT and drives
   *  the right-rail inspector (History / order-rail SoT). */
  railSelection?: boolean;
  footer?: React.ReactNode;
  toolbarPortalTarget?: HTMLElement | null;
}

export function UnshippedShelfBoard({
  records,
  loading,
  searchValue,
  onOpenRecord,
  onClearSearch,
  searchEmptyTitle = 'No orders found',
  searchResultLabel = 'orders to ship',
  clearSearchLabel = 'Show All Pending Orders',
  selectMode = false,
  railSelection = false,
  footer,
  toolbarPortalTarget,
}: UnshippedShelfBoardProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEventBridge({
    'open-shipped-details': (e) => {
      const detail = (e as CustomEvent).detail;
      const id = Number(detail?.order?.id ?? detail?.id);
      setSelectedId(Number.isFinite(id) && id > 0 ? id : null);
    },
    'close-shipped-details': () => setSelectedId(null),
  });

  // The OrdersGridHost below publishes the cursor (it owns grouping + folds);
  // this lane only turns the keyboard on.
  useRecordCursorKeyboard({ enabled: true, scope: 'record' });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Flush sheet host — flex-fill self-scroll (Unbox golden), definite chain. */}
      <div className={WORKBENCH_SHEET_HOST}>
        <OrdersGridHost
          ariaLabel="Shelved unshipped orders"
          records={records}
          loading={loading}
          searchValue={searchValue}
          onOpenRecord={(record) => {
            setSelectedId(Number(record.id));
            onOpenRecord(record);
          }}
          onCloseRecord={() => {
            setSelectedId(null);
            dispatchCloseShippedDetails();
          }}
          onClearSearch={onClearSearch}
          selectMode={selectMode}
          selectionScope={DASHBOARD_ORDERS_SELECTION_SCOPE}
          railSelection={railSelection}
          queueMode="fulfillment"
          searchEmptyTitle={searchEmptyTitle}
          searchResultLabel={searchResultLabel}
          clearSearchLabel={clearSearchLabel}
          data-testid="pending-grid-body"
          columnTriggerPortalTarget={toolbarPortalTarget ?? null}
        />
      </div>
      {footer}
    </div>
  );
}
