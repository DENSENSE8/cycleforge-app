'use client';

/**
 * Unshipped · Pending Grid — To Ship fulfillment queue as a single connected
 * spreadsheet (`OrdersGridView` / `LedgerGrid`). Board|Grid switcher retired;
 * search uses the same grid surface (filtered records).
 *
 * Workbench contract: URL-addressable selection (`?openOrderId`) + right-pane
 * detail. Do not refactor onto SidebarRailShell (single-list rail engine).
 *
 * Scroll: KPI strip lives above the framed table in the page scroll body; the
 * table card uses `TABLE_SURFACE_CLIP_CLASS` (rounded + overflow-hidden) so
 * airtable column lines clip cleanly at the corners. Column header sticks
 * inside the grid when the card self-scrolls; no page-level sticky/split-x.
 */

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { OrdersGridView } from '@/components/dashboard/orders-queue/OrdersGridView';
import { workbenchTableViewportClass } from '@/components/dashboard/workbench-shell';
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
      {/* Framed ops table — rounded + overflow-hidden clips the airtable grid.
          Bounded to the viewport remainder (WORKBENCH_TABLE_VIEWPORT) so the
          grid self-scrolls instead of growing the page: an unbounded host let
          the card run past the fold, which hid its bottom edge and the raised
          elevation with it (the card only looked lifted while the empty/loading
          state kept it short). */}
      <div className={workbenchTableViewportClass({ bulkBarInset })}>
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
