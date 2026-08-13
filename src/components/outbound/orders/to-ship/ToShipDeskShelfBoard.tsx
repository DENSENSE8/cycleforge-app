'use client';

/**
 * To-Ship desk grid shell — same workbench contract as {@link UnshippedShelfBoard}
 * but mounts {@link ToShipDeskGridHost} (desk-local prefs / definition).
 */

import { useState } from 'react';
import { WORKBENCH_SHEET_HOST } from '@/components/dashboard/workbench-shell';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import { dispatchCloseShippedDetails } from '@/utils/events';
import { useEventBridge } from '@/hooks';
import type { ShippedOrder } from '@/types/orders';
import { ToShipDeskGridHost } from './ToShipDeskGridHost';

interface ToShipDeskShelfBoardProps {
  records: ShippedOrder[];
  loading: boolean;
  searchValue: string;
  onOpenRecord: (record: ShippedOrder) => void;
  onClearSearch: () => void;
  searchEmptyTitle?: string;
  searchResultLabel?: string;
  clearSearchLabel?: string;
  selectMode?: boolean;
  railSelection?: boolean;
  footer?: React.ReactNode;
  toolbarPortalTarget?: HTMLElement | null;
}

export function ToShipDeskShelfBoard({
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
}: ToShipDeskShelfBoardProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEventBridge({
    'open-shipped-details': (e) => {
      const detail = (e as CustomEvent).detail;
      const id = Number(detail?.order?.id ?? detail?.id);
      setSelectedId(Number.isFinite(id) && id > 0 ? id : null);
    },
    'close-shipped-details': () => setSelectedId(null),
  });

  useRecordCursorKeyboard({ enabled: true, scope: 'record' });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className={WORKBENCH_SHEET_HOST}>
        <ToShipDeskGridHost
          ariaLabel="To Ship desk queue"
          records={records}
          loading={loading}
          searchValue={searchValue}
          onOpenRecord={(record: ShippedOrder) => {
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
          columnTriggerPortalTarget={toolbarPortalTarget ?? null}
        />
      </div>
      {footer}
    </div>
  );
}
