'use client';

/**
 * Support · Orders primary surface — compose Dashboard To Ship SoT, do not
 * hand-roll a sidebar list.
 *
 * Chrome: WorkbenchChromeHeader + OutboundExactFilters + search
 * Body:   OutboundKpiStrip + UnshippedTable → OrdersGridView (Pending grid)
 *
 * URL stays on `/support?mode=orders` (+ `search` / `ustatus` / …).
 * Row open writes `?openOrderId=` for the Station focus pane.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { OutboundKpiStrip } from '@/components/dashboard/OutboundKpiStrip';
import { OutboundExactFilters, useToShipFilterHotkeys } from '@/components/dashboard/OutboundFilterStrip';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
  WorkbenchChromeHeader,
} from '@/components/dashboard/workbench-shell';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { DASHBOARD_ORDER_VIEW_LABEL } from '@/utils/dashboard-search-state';
import type { ShippedOrder } from '@/types/orders';

const SUPPORT_ORDERS_PATH = '/support';

function useSupportOrdersUrl() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('mode', 'orders');
      mutator(params);
      // Stale board|grid toggle — Pending is grid-only now.
      params.delete('view');
      const qs = params.toString();
      router.replace(qs ? `${SUPPORT_ORDERS_PATH}?${qs}` : `${SUPPORT_ORDERS_PATH}?mode=orders`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const searchQuery = String(searchParams.get('search') || '').trim();

  const setSearch = useCallback(
    (nextValue: string) => {
      const trimmed = nextValue.trim();
      const current = String(searchParams.get('search') || '').trim();
      if (trimmed === current) return;
      replaceParams((params) => {
        if (trimmed) params.set('search', trimmed);
        else params.delete('search');
        params.delete('openOrderId');
      });
    },
    [replaceParams, searchParams],
  );

  const openOrder = useCallback(
    (record: ShippedOrder) => {
      const id = Number(record.id);
      if (!Number.isFinite(id) || id <= 0) return;
      replaceParams((params) => {
        params.set('openOrderId', String(id));
      });
    },
    [replaceParams],
  );

  return { searchQuery, setSearch, openOrder };
}

export function SupportOrdersBoard() {
  const [outboundControlsEl, setOutboundControlsEl] = useState<HTMLDivElement | null>(null);
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());
  const { searchQuery, setSearch, openOrder } = useSupportOrdersUrl();
  useToShipFilterHotkeys(true);

  const tabs = useMemo(
    () => [
      {
        id: 'unshipped',
        label: DASHBOARD_ORDER_VIEW_LABEL.unshipped,
        count: queueCounts?.total,
        color: 'blue' as const,
      },
    ],
    [queueCounts?.total],
  );

  return (
    <DashboardScrollShell
      chrome={
        <div className={WORKBENCH_CHROME_COLUMN}>
          <WorkbenchChromeHeader
            tabs={tabs}
            activeTab="unshipped"
            onTabChange={() => {
              /* Support Orders is To Ship only */
            }}
            solidTone="accent"
            controlsSlotRef={setOutboundControlsEl}
            controlsSlotProps={{ 'data-outbound-controls': '' }}
            search={
              <ToolbarSearchToggle
                value={searchQuery}
                onChange={setSearch}
                onClear={() => setSearch('')}
                placeholder="Filter orders…"
                tone="blue"
              />
            }
            right={<OutboundExactFilters mode="unshipped" />}
          />
        </div>
      }
    >
      <div className={WORKBENCH_BODY_COLUMN}>
        <div className="mb-4">
          <OutboundKpiStrip mode="unshipped" />
        </div>
        <div className="relative flex min-w-0 flex-col">
          <UnshippedTable
            strictSearchScope
            toolbarPortalTarget={outboundControlsEl}
            onOpenRecord={openOrder}
          />
        </div>
      </div>
    </DashboardScrollShell>
  );
}
