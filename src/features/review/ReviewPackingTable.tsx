'use client';

/**
 * Review · Packing — outbound spreadsheet (OrdersGridHost) with Packed / Shipped /
 * History tabs. Selection writes `?packerLogId=` / `?orderId=` for the overlay.
 */

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { OrdersGridHost } from '@/components/dashboard/orders-queue/OrdersGridHost';
import {
  WorkbenchChromeHeader,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import {
  WorkbenchSheetView,
  useWorkbenchSheetChrome,
} from '@/components/dashboard/WorkbenchSheetView';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
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
  const searchQuery = String(searchParams.get('search') || '').trim();
  const staffId = parseStaffParam(searchParams.get('staff')) ?? undefined;

  const week = useMemo(() => getWeekRangeForOffset(0), []);
  // No KPI band on this sheet — the controller is the Band-3 controls portal only.
  const chrome = useWorkbenchSheetChrome();

  const packedQuery = useQuery({
    ...packedOrdersQuery({ searchQuery, staffId }),
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
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.order_id || '').toLowerCase().includes(q) ||
          String(r.product_title || '').toLowerCase().includes(q) ||
          String(r.shipping_tracking_number || '').toLowerCase().includes(q),
      );
    }
    return rows;
  }, [
    tab,
    packedQuery.data,
    shippedQuery.data,
    historyQuery.data,
    staffId,
    searchQuery,
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

  const setSearch = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = next.trim();
      if (trimmed) params.set('search', trimmed);
      else params.delete('search');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const clearSearch = useCallback(() => setSearch(''), [setSearch]);

  const emptyCopy =
    tab === 'packed'
      ? 'No packed (staged) orders'
      : tab === 'shipped'
        ? 'No shipped orders this week'
        : 'No review history yet';

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface-canvas">
      <WorkbenchSheetView
        chrome={chrome}
        className="h-full"
        tabs={({ className }) => (
          <WorkbenchChromeHeader
            density="band"
            tabs={PACKING_TABS}
            activeTab={tab}
            onTabChange={setTab}
            className={className}
          />
        )}
        triage={({ controlsSlotRef }) => (
          <WorkbenchTriageBand
            search={
              <TechRailSearchBar
                variant="chrome"
                value={searchQuery}
                onChange={setSearch}
                placeholder="Filter order #, SKU, tracking…"
                className="min-w-0 flex-1"
                trailingSuffix={<StaffFilterButton density="field" align="end" />}
              />
            }
            controlsSlotRef={controlsSlotRef ?? undefined}
          />
        )}
      >
        {({ controlsEl }) => (
          <OrdersGridHost
            ariaLabel="Orders awaiting packing review"
            records={records as ShippedOrder[]}
            loading={loading}
            searchValue={searchQuery}
            onClearSearch={clearSearch}
            emptyMessage={emptyCopy}
            searchEmptyTitle={`No ${tab} rows found`}
            searchResultLabel={`${tab} orders`}
            clearSearchLabel="Clear search"
            queueMode={tab === 'packed' ? 'staged' : 'fulfillment'}
            sort="newest"
            selectionScope={DASHBOARD_ORDERS_SELECTION_SCOPE}
            columnTriggerPortalTarget={controlsEl}
            data-testid="review-packing-grid-body"
            onOpenRecord={(record) => onOpenRow(record as ReviewTableOrder)}
            onCloseRecord={() => onCloseRow()}
          />
        )}
      </WorkbenchSheetView>
    </div>
  );
}
