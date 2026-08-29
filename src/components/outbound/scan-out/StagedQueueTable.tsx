'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OrdersGridHost } from '@/components/dashboard/orders-queue/OrdersGridHost';
import { cn } from '@/utils/_cn';
import { OrdersFirstRunEmptyState } from '@/components/dashboard/OrdersFirstRunEmptyState';
import { stagedOrdersQuery } from '@/lib/queries/outbound-queries';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';

const DOCK_STAGED_BACKFILL_KEY = 'outbound-dock-staged-mike-v1';

interface StagedQueueTableProps {
  searchQuery: string;
  onOpenOrder: (order: ShippedOrder) => void;
  onCloseOrder: () => void;
  /**
   * Skip the one-time "Mike" staging backfill effect. The scan-out dock keeps
   * it (default); read-only consumers (Labels-station Recent) pass `true`.
   */
  disableBackfill?: boolean;
}

export function StagedQueueTable({
  searchQuery,
  onOpenOrder,
  onCloseOrder,
  disableBackfill = false,
}: StagedQueueTableProps) {
  const queryClient = useQueryClient();
  const { setQ } = useOutboundUrlState();
  const query = useQuery(stagedOrdersQuery({ searchQuery }));
  const records = useMemo(() => query.data ?? [], [query.data]);
  const backfillStarted = useRef(false);

  useEffect(() => {
    if (disableBackfill) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DOCK_STAGED_BACKFILL_KEY)) return;
    if (backfillStarted.current) return;
    backfillStarted.current = true;

    void fetch('/api/shipping/mark-staged', {
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

  return (
    <div className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', 'flex h-full min-h-0 min-w-0 flex-1 flex-col')}>
      <OrdersGridHost
        search={{ value: searchQuery, onChange: setQ, placeholder: 'Filter staged…' }}
        ariaLabel="Orders staged for scan-out"
        records={records}
        queueMode="staged"
        loading={query.isLoading}
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
        sort="priority"
        selectionScope={DASHBOARD_ORDERS_SELECTION_SCOPE}
        data-testid="staged-grid-body"
        onOpenRecord={(record) => onOpenOrder(record)}
        onCloseRecord={() => onCloseOrder()}
      />
    </div>
  );
}
