'use client';

/**
 * Review · Pairing — outbound orders in flight (staged + awaiting label) with
 * allocate-serial detail overlay. Uses existing allocate API + OrdersGridHost.
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

  // No KPI band on this sheet — the controller is the Band-3 controls portal only.
  const chrome = useWorkbenchSheetChrome();

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

  return (
    <div className="relative flex h-full min-w-0 flex-1 overflow-hidden bg-surface-canvas">
      <WorkbenchSheetView
        chrome={chrome}
        className="h-full"
        tabs={({ className }) => (
          <WorkbenchChromeHeader
            density="band"
            tabs={[{ id: 'pairing', label: 'Needs allocation' }]}
            activeTab="pairing"
            onTabChange={() => undefined}
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
                placeholder="Filter order #, SKU, title…"
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
            columnTriggerPortalTarget={null}
            data-testid="review-pairing-grid-body"
            onOpenRecord={onOpenOrder}
            onCloseRecord={() => onCloseOrder()}
          />
        )}
      </WorkbenchSheetView>
    </div>
  );
}
