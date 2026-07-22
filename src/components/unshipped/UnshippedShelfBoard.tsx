'use client';

/**
 * Unshipped · Pending Grid — To Ship fulfillment queue as a single connected
 * spreadsheet (`OrdersGridView` / `LedgerGrid`). Board|Grid switcher retired;
 * search uses the same grid surface (filtered records).
 *
 * Workbench contract: URL-addressable selection (`?openOrderId`) + right-pane
 * detail. Do not refactor onto SidebarRailShell (single-list rail engine).
 */

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { OrdersGridView } from '@/components/dashboard/orders-queue/OrdersGridView';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { useOutboundQueueKeyboard } from '@/hooks/useOutboundQueueKeyboard';
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

  useOutboundQueueKeyboard({
    enabled: true,
    orderedRecords: records,
    selectedId,
    context: 'queue',
    openRecord: onOpenRecord,
  });

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
      {/* Dual-axis self-scroll — spreadsheet owns a bounded viewport-fit
          height (page-scroll + overflow-x-clip kill frozen h-scroll).
          Flush to content edge (no px-3) so the rounded shell meets the
          workbench gutter. */}
      <div className="h-[calc(100dvh-13rem)] min-h-[24rem] min-w-0 pb-3">
        <OrdersGridView
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
          searchEmptyTitle={searchEmptyTitle}
          searchResultLabel={searchResultLabel}
          clearSearchLabel={clearSearchLabel}
        />
      </div>
      {footer}
    </div>
  );
}
