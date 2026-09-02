'use client';

/**
 * Review · Pairing — outbound orders in flight (staged + awaiting label) with
 * allocate-serial detail overlay. Uses existing allocate API + OrdersGridHost.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { OrdersGridHost } from '@/components/dashboard/orders-queue/OrdersGridHost';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { packedOrdersQuery } from '@/lib/queries/dashboard-queries';
import { awaitingLabelsQuery } from '@/lib/queries/outbound-queries';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import type { ShippedOrder } from '@/types/orders';

interface ReviewPairingTableProps {
  onOpenOrder: (order: ShippedOrder) => void;
  onCloseOrder: () => void;
}

export function ReviewPairingTable({ onOpenOrder, onCloseOrder }: ReviewPairingTableProps) {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;


  const stagedQuery = useQuery({
    ...packedOrdersQuery({ searchQuery, staffId }),
  });
  const awaitingQuery = useQuery({
    ...awaitingLabelsQuery({ searchQuery }),
  });

  const records = useMemo(() => {
    const staged = (stagedQuery.data ?? []) as ShippedOrder[];
    const awaiting = (awaitingQuery.data ?? []) as ShippedOrder[];
    const byId = new Map<number, ShippedOrder>();
    for (const row of [...awaiting, ...staged]) {
      const id = Number(row.id);
      if (Number.isFinite(id) && id > 0) byId.set(id, row);
    }
    return Array.from(byId.values());
  }, [stagedQuery.data, awaitingQuery.data]);

  const loading = stagedQuery.isLoading || awaitingQuery.isLoading;

  const setSearch = useCallback((next: string) => setSearchQuery(next), []);
  const clearSearch = useCallback(() => setSearch(''), [setSearch]);

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface-canvas">
      <DashboardScrollShell className="h-full">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <OrdersGridHost
            search={{ value: searchQuery, onChange: setSearch, placeholder: 'Filter order #, SKU, title…' }}
            ariaLabel="Orders awaiting pairing review"
            records={records}
            loading={loading}
            searchValue={searchQuery}
            onClearSearch={clearSearch}
            emptyMessage="No outbound orders needing serial/SKU pairing"
            searchEmptyTitle="No matching orders"
            searchResultLabel="orders"
            clearSearchLabel="Clear search"
            queueMode="staged"
            sort="newest"
            selectionScope={DASHBOARD_ORDERS_SELECTION_SCOPE}
            data-testid="review-pairing-grid-body"
            onOpenRecord={onOpenOrder}
            onCloseRecord={() => onCloseOrder()}
          />
        </div>
      </DashboardScrollShell>
    </div>
  );
}
