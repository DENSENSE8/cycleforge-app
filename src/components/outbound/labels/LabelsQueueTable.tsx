'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { OrdersQueueTable } from '@/components/dashboard/OrdersQueueTable';
import { OrdersFirstRunEmptyState } from '@/components/dashboard/OrdersFirstRunEmptyState';
import { AddTrackingNavProvider } from '@/components/outbound/labels/add-tracking-context';
import { useDashboardScrollParentOptional } from '@/components/dashboard/DashboardScrollShell';
import { MONITOR_SECTION_CARD_SCROLL_CLASS } from '@/design-system/components/monitor';
import { awaitingLabelsQuery } from '@/lib/queries/outbound-queries';
import { deriveFulfillmentState, type FulfillmentState } from '@/lib/unshipped-state';
import type { OutboundSort } from '@/components/outbound/outbound-sidebar-shared';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

interface LabelsQueueTableProps {
  searchQuery: string;
  sort: OutboundSort;
  onOpenOrder: (order: ShippedOrder) => void;
  onCloseOrder: () => void;
  /** Hide the built-in banner when the mode tab band already labels the queue. */
  hideHeader?: boolean;
}

export function LabelsQueueTable({
  searchQuery,
  sort,
  onOpenOrder,
  onCloseOrder,
  hideHeader = false,
}: LabelsQueueTableProps) {
  const searchParams = useSearchParams();
  const query = useQuery(awaitingLabelsQuery({ searchQuery, sort }));
  // Grow-mode inside a DashboardScrollShell (one scroll port, KPI scrolls away);
  // self-scroll boxed otherwise. Mirrors PackedOrdersTable.
  const dashboardScrollRef = useDashboardScrollParentOptional();
  const pageScroll = Boolean(dashboardScrollRef);

  // Same URL waist as Dashboard · To Ship / Shipping · Pending
  // (`?ustatus` + `?attention` → Urgent).
  const statusFilter = String(searchParams.get('ustatus') || '').trim().toUpperCase() as
    | FulfillmentState
    | '';
  const urgentOnly =
    searchParams.get('attention') === '1' || searchParams.get('attention') === 'true';

  const records = useMemo(() => {
    const rows = [...(query.data ?? [])].filter((r) => {
      const row = r as ShippedOrder & {
        has_tech_scan?: boolean;
        out_of_stock?: string | null;
        is_urgent?: boolean;
      };
      const state = deriveFulfillmentState({
        hasTechScan: Boolean(row.has_tech_scan),
        outOfStock: row.out_of_stock,
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

  const table = (
    <OrdersQueueTable
      records={records}
      queueMode="labels"
      loading={query.isLoading}
      isRefreshing={query.isFetching && !query.isLoading}
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
      bannerTitle="Awaiting label"
      bannerSubtitle={`${records.length} order${records.length === 1 ? '' : 's'} need a carrier label`}
      hideHeader={hideHeader}
      sort={sort}
      onOpenRecord={(record) => onOpenOrder(record)}
      onCloseRecord={() => onCloseOrder()}
      listShell={pageScroll ? 'monitor' : 'default'}
      noHorizontalScroll={pageScroll}
      growToContent={pageScroll}
      scrollParentRef={pageScroll ? (dashboardScrollRef ?? undefined) : undefined}
      virtualized={pageScroll}
    />
  );

  return (
    <AddTrackingNavProvider orderedIds={awaitingOrderIds}>
      {pageScroll ? <div className={MONITOR_SECTION_CARD_SCROLL_CLASS}>{table}</div> : table}
    </AddTrackingNavProvider>
  );
}
