'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OrdersQueueTable } from '@/components/dashboard/OrdersQueueTable';
import { OrdersFirstRunEmptyState } from '@/components/dashboard/OrdersFirstRunEmptyState';
import { useDashboardScrollParentOptional } from '@/components/dashboard/DashboardScrollShell';
import { MONITOR_SECTION_CARD_SCROLL_CLASS } from '@/design-system/components/monitor';
import { stagedOrdersQuery } from '@/lib/queries/outbound-queries';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

const DOCK_STAGED_BACKFILL_KEY = 'outbound-dock-staged-mike-v1';

interface StagedQueueTableProps {
  searchQuery: string;
  onOpenOrder: (order: ShippedOrder) => void;
  onCloseOrder: () => void;
  /** Hide the built-in banner when the mode tab band already labels the queue. */
  hideHeader?: boolean;
  /**
   * Skip the one-time "Mike" staging backfill effect. The scan-out dock keeps it
   * (default); read-only consumers (Labels-station Recent) pass `true`.
   */
  disableBackfill?: boolean;
}

export function StagedQueueTable({
  searchQuery,
  onOpenOrder,
  onCloseOrder,
  hideHeader = false,
  disableBackfill = false,
}: StagedQueueTableProps) {
  const queryClient = useQueryClient();
  const query = useQuery(stagedOrdersQuery({ searchQuery }));
  const records = useMemo(() => query.data ?? [], [query.data]);
  const backfillStarted = useRef(false);
  // Grow-mode when inside a DashboardScrollShell (one scroll port, KPI scrolls
  // away); self-scroll boxed otherwise (the scan-out WorkbenchTablePane).
  const dashboardScrollRef = useDashboardScrollParentOptional();
  const pageScroll = Boolean(dashboardScrollRef);

  useEffect(() => {
    if (disableBackfill) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DOCK_STAGED_BACKFILL_KEY)) return;
    if (backfillStarted.current) return;
    backfillStarted.current = true;

    void fetch('/api/outbound/mark-staged', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffName: 'Mike' }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ ok?: boolean; marked?: number }>;
      })
      .then((data) => {
        if (!data?.ok) return;
        localStorage.setItem(DOCK_STAGED_BACKFILL_KEY, String(Date.now()));
        if ((data.marked ?? 0) > 0) {
          void queryClient.invalidateQueries({ queryKey: ['outbound', 'staged'] });
        }
      })
      .catch(() => undefined);
  }, [queryClient, disableBackfill]);

  const countLabel = `${records.length} package${records.length === 1 ? '' : 's'} ready to scan out`;

  const table = (
    <OrdersQueueTable
      records={records}
      queueMode="staged"
      loading={query.isLoading}
      isRefreshing={query.isFetching && !query.isLoading}
      searchValue={searchQuery}
      onClearSearch={() => undefined}
      emptyMessage="No packages staged at the dock"
      firstRunEmpty={
        <OrdersFirstRunEmptyState
          title="Nothing staged to ship"
          description="Packages staged at the dock appear here. Connect a sales channel so orders flow into fulfillment."
        />
      }
      searchEmptyTitle="No matching staged packages"
      searchResultLabel="staged packages"
      clearSearchLabel="Show all staged"
      bannerTitle="Staging"
      bannerSubtitle={countLabel}
      bannerCompact
      hideHeader={hideHeader}
      sort="priority"
      onOpenRecord={(record) => onOpenOrder(record)}
      onCloseRecord={() => onCloseOrder()}
      listShell={pageScroll ? 'monitor' : 'default'}
      noHorizontalScroll={pageScroll}
      growToContent={pageScroll}
      scrollParentRef={pageScroll ? (dashboardScrollRef ?? undefined) : undefined}
      virtualized={pageScroll}
    />
  );

  // Grow-mode: wrap in the monitor card so the growing list keeps the house shell
  // (mirrors PackedOrdersTable). Boxed callers own their own WorkbenchTablePane.
  if (pageScroll) {
    return <div className={MONITOR_SECTION_CARD_SCROLL_CLASS}>{table}</div>;
  }
  return table;
}
