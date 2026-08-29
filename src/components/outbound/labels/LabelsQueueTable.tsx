'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { OrdersGridHost } from '@/components/dashboard/orders-queue/OrdersGridHost';
import { OrdersFirstRunEmptyState } from '@/components/dashboard/OrdersFirstRunEmptyState';
import { AddTrackingNavProvider } from '@/components/outbound/labels/add-tracking-context';
import { awaitingLabelsQuery } from '@/lib/queries/outbound-queries';
import { deriveFulfillmentState, type FulfillmentState } from '@/lib/unshipped-state';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import type { OutboundSort } from '@/components/outbound/outbound-sidebar-shared';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';

interface LabelsQueueTableProps {
  searchQuery: string;
  sort: OutboundSort;
  onOpenOrder: (order: ShippedOrder) => void;
  onCloseOrder: () => void;
}

export function LabelsQueueTable({
  searchQuery,
  sort,
  onOpenOrder,
  onCloseOrder,
}: LabelsQueueTableProps) {
  const searchParams = useSearchParams();
  const { setQ } = useOutboundUrlState();
  const query = useQuery(awaitingLabelsQuery({ searchQuery, sort }));

  const statusFilter = String(searchParams.get('ustatus') || '').trim().toUpperCase() as
    | FulfillmentState
    | '';
  const urgentOnly =
    searchParams.get('attention') === '1' || searchParams.get('attention') === 'true';

  const records = useMemo(() => {
    const rows = [...(query.data ?? [])].filter((r) => {
      const row = r as ShippedOrder & {
        has_tech_scan?: boolean;
        is_out_of_stock?: boolean;
        is_urgent?: boolean;
      };
      const state = deriveFulfillmentState({
        hasTechScan: Boolean(row.has_tech_scan),
        isOutOfStock: Boolean(row.is_out_of_stock),
      });
      if (statusFilter && state !== statusFilter) return false;
      if (urgentOnly && !row.is_urgent) return false;
      return true;
    });
    if (sort === 'newest') {
      rows.sort((a, b) => {
        const aTs = Date.parse(String(a.created_at || '')) || 0;
        const bTs = Date.parse(String(b.created_at || '')) || 0;
        return bTs - aTs;
      });
      return rows;
    }
    rows.sort((a, b) => {
      const aDeadline = Date.parse(String(a.deadline_at || '')) || Number.MAX_SAFE_INTEGER;
      const bDeadline = Date.parse(String(b.deadline_at || '')) || Number.MAX_SAFE_INTEGER;
      if (aDeadline !== bDeadline) return aDeadline - bDeadline;
      const aTs = Date.parse(String(a.created_at || '')) || 0;
      const bTs = Date.parse(String(b.created_at || '')) || 0;
      return aTs - bTs;
    });
    return rows;
  }, [query.data, sort, statusFilter, urgentOnly]);

  const awaitingOrderIds = records.map((r) => Number(r.id));

  return (
    <AddTrackingNavProvider orderedIds={awaitingOrderIds}>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <OrdersGridHost
          search={{ value: searchQuery, onChange: setQ, placeholder: 'Filter labels queue…' }}
          ariaLabel="Labels queue"
          records={records}
          queueMode="labels"
          loading={query.isLoading}
          searchValue={searchQuery}
          onClearSearch={() => undefined}
          emptyMessage="No orders awaiting labels"
          firstRunEmpty={
            <OrdersFirstRunEmptyState
              title="No labels to print"
              description="Orders waiting on a carrier label land here. They flow in automatically once you connect a sales channel."
            />
          }
          searchEmptyTitle="No matching orders"
          searchResultLabel="orders awaiting labels"
          clearSearchLabel="Show all awaiting labels"
          sort={sort}
          selectionScope={DASHBOARD_ORDERS_SELECTION_SCOPE}
          data-testid="labels-grid-body"
          onOpenRecord={(record) => onOpenOrder(record)}
          onCloseRecord={() => onCloseOrder()}
        />
      </div>
    </AddTrackingNavProvider>
  );
}
