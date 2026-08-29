'use client';

/**
 * Dashboard · Packed — staged queue (PACK event, no dock scan-out).
 * `/api/orders?stagedOnly=true` via {@link packedOrdersQuery}, same outbound
 * spreadsheet as Pending / Tested (`useOrdersSpreadsheet` → NonlinearTableHost).
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DataTable, type DataTableSearch } from '@/components/tables/DataTable';
import { useOrdersSpreadsheet } from '@/components/dashboard/orders-queue/useOrdersSpreadsheet';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import { dispatchOpenShippedDetails, dispatchCloseShippedDetails } from '@/utils/events';
import { usePackedOrdersFeed } from '@/hooks/usePackedOrdersFeed';
import { useRecordCursorKeyboard } from '@/hooks/useRecordCursorKeyboard';
import type { ShippedOrder } from '@/types/orders';
import type {
  OrdersQueueColumn,
  OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';
import { useRefreshSignal } from '@/lib/refresh/bus';
import { Button } from '@/design-system/primitives';
import { OUTBOUND_MODE_PATHS } from '@/lib/outbound/outbound-sidebar-shared';

export interface PackedOrdersTableProps {
  selectMode?: boolean;
  /** Rail-selection model: the check-set is the single selection SoT and drives
   *  the right-rail inspector (History / order-rail SoT). */
  railSelection?: boolean;
  /** The find field, as data — the desk above owns the URL it writes. */
  search: DataTableSearch;
}

export function PackedOrdersTable({
  selectMode = false,
  railSelection = false,
  search,
}: PackedOrdersTableProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { records, searchQuery, dateFrom, dateTo, query } = usePackedOrdersFeed();

  useRefreshSignal('orders.outbound', () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-table', 'packed'] });
  });

  useRecordCursorKeyboard({ enabled: true, scope: 'record' });

  const clearSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('search');
    const qs = params.toString();
    router.replace(qs ? `${pathname || '/shipping/orders'}?${qs}` : pathname || '/shipping/orders', {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  const idleEmpty =
    !query.isLoading && records.length === 0 && !searchQuery && !dateFrom && !dateTo ? (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <p className="text-role-caption font-semibold text-text-default">Nothing staged</p>
        <p className="max-w-sm text-role-caption text-text-soft">
          Packed orders waiting for dock scan-out land here. Open Scan-out to stage the next package.
        </p>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => router.push(OUTBOUND_MODE_PATHS['scan-out'])}
        >
          Open Scan-out
        </Button>
      </div>
    ) : undefined;

  const sheet = useOrdersSpreadsheet({
    ariaLabel: 'Packed orders',
    records: records as ShippedOrder[],
    loading: query.isLoading,
    searchValue: searchQuery,
    onClearSearch: clearSearch,
    emptyMessage: 'No packed orders',
    firstRunEmpty: idleEmpty,
    searchEmptyTitle: 'No packed orders found',
    searchResultLabel: 'packed orders',
    clearSearchLabel: 'Show All Packed Orders',
    queueMode: 'staged',
    sort: 'newest',
    selectMode,
    selectionScope: DASHBOARD_ORDERS_SELECTION_SCOPE,
    railSelection,
    'data-testid': 'packed-grid-body',
    onOpenRecord: (record) => {
      dispatchOpenShippedDetails(record, 'packed');
    },
    onCloseRecord: () => {
      dispatchCloseShippedDetails();
    },
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
      <DataTable<ShippedOrder, OrdersQueueColumnKey, OrdersQueueColumn>
        {...sheet}
        search={search}
      />
    </div>
  );
}
