'use client';

/**
 * One To-ship compare pane — independent lifecycle view + selection scope.
 * Pending / Tested use the unshipped query; Packed / Shipped mount their
 * existing table components.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { PackedOrdersTable } from '@/components/dashboard/PackedOrdersTable';
import { OrdersGridView } from '@/components/dashboard/orders-queue/OrdersGridView';
import { unshippedOrdersQuery } from '@/lib/queries/dashboard-queries';
import { deriveFulfillmentState } from '@/lib/unshipped-state';
import { dispatchOpenShippedDetails } from '@/utils/events';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { DASHBOARD_ORDER_VIEW_LABEL, type DashboardOrderView } from '@/utils/dashboard-search-state';
import type { OrdersComparePaneId } from '@/lib/shipping/orders-compare-layout';
import type { ShippedOrder } from '@/types/orders';
import { cn } from '@/utils/_cn';

function fulfillmentSignals(r: ShippedOrder) {
  const row = r as ShippedOrder & {
    has_tech_scan?: boolean;
    is_out_of_stock?: boolean;
  };
  return {
    hasTechScan: Boolean(row.has_tech_scan),
    isOutOfStock: Boolean(row.is_out_of_stock),
  };
}

const DashboardShippedTable = dynamic(
  () => import('@/components/shipped').then((m) => m.DashboardShippedTable),
  { ssr: false, loading: () => <div className="min-h-[120px] bg-surface-canvas" aria-hidden /> },
);

export function OrdersPaneTable({
  paneId,
  view,
  active,
  onActivate,
  selectMode = false,
  className,
  columnTriggerPortalTarget = null,
}: {
  paneId: OrdersComparePaneId;
  view: DashboardOrderView;
  active: boolean;
  onActivate: () => void;
  selectMode?: boolean;
  className?: string;
  /** Band-3 ▦ host — host passes only for the active pane. */
  columnTriggerPortalTarget?: HTMLElement | null;
}) {
  const scope = `orders:compare:${paneId}`;
  const { searchQuery, setSearch } = useDashboardSearchController();

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col border border-border-soft bg-surface-card',
        active ? 'ring-1 ring-accent-bg/40' : undefined,
        className,
      )}
      data-orders-compare-pane={paneId}
      data-orders-compare-view={view}
      onPointerDown={onActivate}
    >
      <div className="flex h-8 shrink-0 items-center border-b border-border-hairline px-2">
        <span className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
          {DASHBOARD_ORDER_VIEW_LABEL[view]}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {view === 'unshipped' || view === 'tested' ? (
          <UnshippedComparePane
            view={view}
            selectMode={selectMode}
            selectionScope={scope}
            searchQuery={searchQuery}
            onClearSearch={() => setSearch('')}
            columnTriggerPortalTarget={columnTriggerPortalTarget}
          />
        ) : view === 'packed' ? (
          <PackedOrdersTable
            selectMode={selectMode}
            railSelection={false}
            toolbarPortalTarget={columnTriggerPortalTarget}
          />
        ) : (
          <DashboardShippedTable
            selectMode={selectMode}
            railSelection={false}
            toolbarPortalTarget={columnTriggerPortalTarget}
          />
        )}
      </div>
    </div>
  );
}

function UnshippedComparePane({
  view,
  selectMode,
  selectionScope,
  searchQuery,
  onClearSearch,
  columnTriggerPortalTarget = null,
}: {
  view: 'unshipped' | 'tested';
  selectMode: boolean;
  selectionScope: string;
  searchQuery: string;
  onClearSearch: () => void;
  columnTriggerPortalTarget?: HTMLElement | null;
}) {
  const { data, isPending } = useQuery(unshippedOrdersQuery());
  const records = useMemo(() => {
    const rows = (data ?? []) as ShippedOrder[];
    return rows.filter((r) => {
      const state = deriveFulfillmentState(fulfillmentSignals(r));
      if (view === 'tested') return state === 'TESTED';
      return state === 'PENDING' || state === 'BLOCKED';
    });
  }, [data, view]);

  return (
    <OrdersGridView
      records={records}
      loading={isPending}
      searchValue={searchQuery}
      onOpenRecord={(record) => dispatchOpenShippedDetails(record, 'queue')}
      onClearSearch={onClearSearch}
      emptyMessage={view === 'tested' ? 'No tested orders' : 'No pending orders'}
      selectMode={selectMode}
      selectionScope={selectionScope}
      railSelection={false}
      queueMode="fulfillment"
      ariaLabel={`${DASHBOARD_ORDER_VIEW_LABEL[view]} compare pane`}
      columnTriggerPortalTarget={columnTriggerPortalTarget}
    />
  );
}
