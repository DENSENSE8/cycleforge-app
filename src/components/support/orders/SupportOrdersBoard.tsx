'use client';

/**
 * Support · Orders primary surface — compose Dashboard To Ship SoT, do not
 * hand-roll a sidebar list.
 *
 * Chrome: WorkbenchChromeHeader + OutboundExactFilters + Board|Grid + search
 * Body:   OutboundKpiStrip + UnshippedTable → OrdersQueueTable family
 *
 * URL stays on `/support?mode=orders` (+ `search` / `ustatus` / `view` / …).
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
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import {
  DASHBOARD_ORDER_VIEW_LABEL,
  getDashboardPendingLayoutFromSearch,
  type DashboardPendingLayout,
} from '@/utils/dashboard-search-state';
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
      const qs = params.toString();
      router.replace(qs ? `${SUPPORT_ORDERS_PATH}?${qs}` : `${SUPPORT_ORDERS_PATH}?mode=orders`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const searchQuery = String(searchParams.get('search') || '').trim();
  const pendingLayout = getDashboardPendingLayoutFromSearch(searchParams);

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

  const setPendingLayout = useCallback(
    (next: DashboardPendingLayout) => {
      replaceParams((params) => {
        if (next === 'grid') params.set('view', 'grid');
        else params.delete('view');
      });
    },
    [replaceParams],
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

  return { searchQuery, pendingLayout, setSearch, setPendingLayout, openOrder };
}

export function SupportOrdersBoard() {
  const [outboundControlsEl, setOutboundControlsEl] = useState<HTMLDivElement | null>(null);
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());
  const { searchQuery, pendingLayout, setSearch, setPendingLayout, openOrder } =
    useSupportOrdersUrl();
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

  const pendingLayoutToggle = (
    <HorizontalButtonSlider
      variant="nav"
      dense
      aria-label="Pending layout"
      value={pendingLayout}
      onChange={(id) => setPendingLayout(id as DashboardPendingLayout)}
      items={[
        { id: 'board', label: 'Board' },
        { id: 'grid', label: 'Grid' },
      ]}
    />
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
            trailing={pendingLayoutToggle}
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
