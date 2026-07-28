'use client';

/**
 * Review · Pairing — outbound orders in flight (staged + awaiting label) with
 * allocate-serial detail overlay. Uses existing allocate API + OrdersGridView.
 */

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { OrdersGridView } from '@/components/dashboard/orders-queue/OrdersGridView';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WORKBENCH_TABLE_VIEWPORT_NO_KPI,
  WorkbenchChromeHeader,
} from '@/components/dashboard/workbench-shell';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = String(searchParams.get('search') || '').trim();
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

  const clearSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface-canvas">
      <DashboardScrollShell
        className="h-full"
        chrome={
          <div className={WORKBENCH_CHROME_COLUMN}>
            <WorkbenchChromeHeader
              tabs={[{ id: 'pairing', label: 'Needs allocation' }]}
              activeTab="pairing"
              onTabChange={() => undefined}
              right={<StaffFilterButton iconOnly />}
            />
          </div>
        }
      >
        <div className={`${WORKBENCH_BODY_COLUMN} ${WORKBENCH_TABLE_VIEWPORT_NO_KPI} pb-3`}>
          <OrdersGridView
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
