'use client';

/**
 * Unshipped · Pending Grid — To Ship fulfillment queue as a single connected
 * spreadsheet (`OrdersGridView` → `LedgerGridSurface` `surface="sheet"`).
 * Board|Grid switcher retired; search uses the same grid surface (filtered records).
 *
 * Workbench contract: URL-addressable selection (`?openOrderId`) + right-pane
 * detail. Do not refactor onto SidebarRailShell (single-list rail engine).
 *
 * Scroll: KPI strip is pinned in `DashboardOrdersView` sheet chrome; the
 * table host uses `WORKBENCH_SHEET_HOST` + a bounded viewport so the grid
 * self-scrolls. Column header sticks inside the grid; no page-level sticky.
 */

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { OrdersGridView } from '@/components/dashboard/orders-queue/OrdersGridView';
import {
  WORKBENCH_SHEET_HOST,
  workbenchTableViewportClass,
} from '@/components/dashboard/workbench-shell';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { dispatchCloseShippedDetails } from '@/utils/events';
import { useEventBridge } from '@/hooks';
import { cn } from '@/utils/_cn';
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
  /** Reserve bottom room for the pinned bulk-selection capsule (see
   *  `workbenchTableViewportClass`). Pass the host's `bulkBarVisible`. */
  bulkBarInset?: boolean;
  /** Rail-selection model: the check-set is the single selection SoT and drives
   *  the right-rail inspector. Dashboard outbound lanes only — see
   *  `docs/todo/order-rail-selection-plane-PLAN.md`. */
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
  bulkBarInset = false,
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

  // The OrdersGridView below publishes the cursor (it owns grouping + folds);
  // this lane only turns the keyboard on.
  useRecordCursorKeyboard({ enabled: true, scope: 'record' });

  // Staff filter only — no table-options / column-config / density chrome.
  const searchToolbar = useMemo(() => <StaffFilterButton iconOnly />, []);

  return (
    <div className="flex min-w-0 flex-col">
      {toolbarPortalTarget
        ? createPortal(searchToolbar, toolbarPortalTarget)
        : (
          <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border-soft px-3 py-1.5">
            {searchToolbar}
          </div>
        )}
      {/* Flush sheet host — bounded viewport so the grid self-scrolls. */}
      <div className={cn(WORKBENCH_SHEET_HOST, workbenchTableViewportClass({ bulkBarInset }))}>
        <OrdersGridView
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
        />
      </div>
      {footer}
    </div>
  );
}
