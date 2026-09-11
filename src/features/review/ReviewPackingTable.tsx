'use client';

/**
 * Review · Packing — outbound spreadsheet (DataTable) with Packed / Shipped /
 * History tabs. Selection writes `?packerLogId=` / `?orderId=` for the overlay.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import { useOrdersSpreadsheet } from '@/components/dashboard/orders-queue/useOrdersSpreadsheet';
import { OrderStatusTrailStage } from '@/components/orders/OrderStatusTrailOverlay';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { packedOrdersQuery, dashboardShippedQuery } from '@/lib/queries/dashboard-queries';
import { usePackReviewQueue } from '@/features/review/usePackReviewQueue';
import { packReviewRowToShippedOrder, type ReviewTableOrder } from '@/lib/packing/review-table-mappers';
import {
  parseReviewPackingTab,
  type ReviewPackingTab,
} from '@/lib/packing/review-packing-tabs';
import { getWeekRangeForOffset } from '@/lib/dashboard-week-range';
import { toDetailRecord } from '@/components/shipped/shipped-record-mappers';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { DASHBOARD_ORDERS_SELECTION_SCOPE } from '@/lib/selection/dashboard-scopes';
import type { ShippedOrder } from '@/types/orders';
import type { PackerRecord } from '@/hooks/usePackerLogs';

/**
 * The lane strip. `packed` is the default lane, so it IS the unfiltered view
 * and lights no tab — the same rule every other strip follows.
 */
const PACKING_TABS: Array<{ id: ReviewPackingTab; label: string }> = [
  { id: 'packed', label: 'Packed' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'history', label: 'History' },
];

interface ReviewPackingTableProps {
  onOpenRow: (order: ReviewTableOrder) => void;
  onCloseRow: () => void;
}

export function ReviewPackingTable({ onOpenRow, onCloseRow }: ReviewPackingTableProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseReviewPackingTab(searchParams.get('rtab'));
  const [searchQuery, setSearchQuery] = useState('');
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;

  const week = useMemo(() => getWeekRangeForOffset(0), []);

  const packedQuery = useQuery({
    ...packedOrdersQuery({ staffId }),
    enabled: tab === 'packed',
  });

  const shippedQuery = useQuery({
    ...dashboardShippedQuery({
      weekStart: week.startStr,
      weekEnd: week.endStr,
      staffId,
      limit: 500,
      phase: 'full',
    }),
    enabled: tab === 'shipped',
  });

  const historyQuery = usePackReviewQueue('history', { enabled: tab === 'history' });
  const latestQuery = usePackReviewQueue('latest', {
    enabled: tab === 'packed' || tab === 'shipped',
  });

  const outcomeByPackerLog = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of latestQuery.data ?? []) {
      map.set(row.packerLogId, row.outcome);
    }
    return map;
  }, [latestQuery.data]);

  const records: ReviewTableOrder[] = useMemo(() => {
    if (tab === 'packed') {
      return ((packedQuery.data ?? []) as ReviewTableOrder[]).map((r) => {
        const pl = Number(r.packer_log_id);
        if (!Number.isFinite(pl) || pl <= 0) return r;
        const outcome = outcomeByPackerLog.get(pl);
        return outcome ? { ...r, verification_outcome: outcome } : r;
      });
    }
    if (tab === 'shipped') {
      return ((shippedQuery.data ?? []) as PackerRecord[]).map((r) => {
        const base = toDetailRecord(r) as ReviewTableOrder;
        const pl = Number(r.packer_log_id ?? base.packer_log_id);
        const fromRow = r.verification_outcome ?? base.verification_outcome;
        const fromIndex = Number.isFinite(pl) && pl > 0 ? outcomeByPackerLog.get(pl) : undefined;
        return {
          ...base,
          packer_log_id: r.packer_log_id ?? base.packer_log_id,
          verification_outcome: fromRow || fromIndex || null,
        };
      });
    }
    let rows = (historyQuery.data ?? []).map(packReviewRowToShippedOrder);
    if (staffId != null) {
      rows = rows.filter((r) => Number(r.packer_id) === staffId || Number(r.packed_by) === staffId);
    }
    return rows;
  }, [
    tab,
    packedQuery.data,
    shippedQuery.data,
    historyQuery.data,
    staffId,
    outcomeByPackerLog,
  ]);

  const loading =
    tab === 'packed'
      ? packedQuery.isLoading
      : tab === 'shipped'
        ? shippedQuery.isLoading
        : historyQuery.isLoading;

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'packed') params.delete('rtab');
      else params.set('rtab', next);
      params.delete('packerLogId');
      params.delete('orderId');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setSearch = useCallback((next: string) => setSearchQuery(next), []);
  const clearSearch = useCallback(() => setSearchQuery(''), []);

  const emptyCopy =
    tab === 'packed'
      ? 'No packed (staged) orders'
      : tab === 'shipped'
        ? 'No shipped orders this week'
        : 'No review history yet';

  const sheet = useOrdersSpreadsheet({
    ariaLabel: 'Orders awaiting packing review',
    records: records as ShippedOrder[],
    loading,
    searchValue: searchQuery,
    onClearSearch: clearSearch,
    emptyMessage: emptyCopy,
    searchEmptyTitle: `No ${tab} rows found`,
    searchResultLabel: `${tab} orders`,
    clearSearchLabel: 'Clear search',
    queueMode: tab === 'packed' ? 'staged' : 'fulfillment',
    selectionScope: DASHBOARD_ORDERS_SELECTION_SCOPE,
    'data-testid': 'review-packing-grid-body',
    onOpenRecord: (record) => onOpenRow(record as ReviewTableOrder),
    onCloseRecord: () => onCloseRow(),
  });

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface-canvas">
      <DashboardScrollShell className="h-full">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <OrderStatusTrailStage>
            <DataTable
              {...sheet}
              tabs={PACKING_TABS.filter((t) => t.id !== 'packed')}
              activeTab={tab === 'packed' ? undefined : tab}
              onTabChange={(id) => setTab(id === tab ? 'packed' : id)}
              search={{ value: searchQuery, onChange: setSearch, placeholder: 'Filter order #, SKU, tracking…' }}
            />
          </OrderStatusTrailStage>
        </div>
      </DashboardScrollShell>
    </div>
  );
}
