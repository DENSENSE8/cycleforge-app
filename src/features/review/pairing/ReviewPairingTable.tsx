'use client';

/**
 * Review · Pairing — outbound orders in flight (staged + awaiting label) with
 * allocate-serial detail overlay. Uses existing allocate API + OrdersQueueTable.
 */

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { OrdersQueueTable } from '@/components/dashboard/OrdersQueueTable';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WorkbenchChromeHeader,
} from '@/components/dashboard/workbench-shell';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { TableColumnConfigProvider } from '@/components/ui/table-column-config/TableColumnConfig';
import { ColumnConfigButton } from '@/components/ui/table-column-config/ColumnConfigButton';
import { TableOptionsMenu } from '@/components/ui/table-options/TableOptionsMenu';
import { TableDensityProvider } from '@/components/ui/table-density/TableDensityProvider';
import { packedOrdersQuery } from '@/lib/queries/dashboard-queries';
import { awaitingLabelsQuery } from '@/lib/queries/outbound-queries';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { MONITOR_SECTION_CARD_SCROLL_CLASS } from '@/design-system/components/monitor';
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
  const fetching =
    (stagedQuery.isFetching || awaitingQuery.isFetching) && !loading;

  const clearSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const toolbar = (
    <div className="flex items-center gap-2">
      <StaffFilterButton iconOnly />
      <ColumnConfigButton variant="toolbar" />
      <TableOptionsMenu showDensity showColumnPresets />
    </div>
  );

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
              right={toolbar}
            />
          </div>
        }
      >
        <div className={WORKBENCH_BODY_COLUMN}>
          <div className={MONITOR_SECTION_CARD_SCROLL_CLASS}>
            <TableColumnConfigProvider tableId="orders">
              <TableDensityProvider tableId="orders" urlSync={false}>
                <OrdersQueueTable
                  records={records}
                  loading={loading}
                  isRefreshing={fetching}
                  searchValue={searchQuery}
                  onClearSearch={clearSearch}
                  emptyMessage="No outbound orders needing serial/SKU pairing"
                  searchEmptyTitle="No matching orders"
                  searchResultLabel="orders"
                  clearSearchLabel="Clear search"
                  queueMode="staged"
                  sort="newest"
                  onOpenRecord={onOpenOrder}
                  onCloseRecord={() => onCloseOrder()}
                  hideHeader
                  inheritColumnConfig
                  listShell="monitor"
                  noHorizontalScroll
                  growToContent
                />
              </TableDensityProvider>
            </TableColumnConfigProvider>
          </div>
        </div>
      </DashboardScrollShell>
    </div>
  );
}
