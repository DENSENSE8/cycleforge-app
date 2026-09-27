'use client';

/**
 * Review · Pairing — outbound orders in flight (staged + awaiting label) with
 * allocate-serial detail overlay. Uses existing allocate API + DataTable.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import { useOrdersSpreadsheet } from '@/components/dashboard/orders-queue/useOrdersSpreadsheet';
import { OrderStatusTrailStage } from '@/components/orders/OrderStatusTrailOverlay';
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
    ...packedOrdersQuery({ staffId }),
  });
  const awaitingQuery = useQuery({
    ...awaitingLabelsQuery(),
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
  const clearSearch = useCallback(() => setSearchQuery(''), []);

  // Review opens records in its own workspace — the desk record plane bag is not a table prop.
  const { recordPlane, ...sheet } = useOrdersSpreadsheet({
    ariaLabel: 'Orders awaiting pairing review',
    records,
    loading,
    searchValue: searchQuery,
    onClearSearch: clearSearch,
    emptyMessage: 'No outbound orders needing serial/SKU pairing',
    searchEmptyTitle: 'No matching orders',
    searchResultLabel: 'orders',
    clearSearchLabel: 'Clear search',
    queueMode: 'staged',
    selectionScope: DASHBOARD_ORDERS_SELECTION_SCOPE,
    'data-testid': 'review-pairing-grid-body',
    onOpenRecord: onOpenOrder,
    onCloseRecord: () => onCloseOrder(),
  });

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface-canvas">
      <DashboardScrollShell className="h-full">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <OrderStatusTrailStage>
            <DataTable
              {...sheet}
              search={{ value: searchQuery, onChange: setSearch, placeholder: 'Filter order #, SKU, title…' }}
            />
          </OrderStatusTrailStage>
        </div>
      </DashboardScrollShell>
    </div>
  );
}
