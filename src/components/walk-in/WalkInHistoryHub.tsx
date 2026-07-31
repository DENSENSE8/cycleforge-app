'use client';

/**
 * Sales hub — front-desk history surface: Local Pickup · Sales (dashboard L2
 * modes `?mode=pickup|sales`, per-mode tabs that swap between genuinely separate
 * tables). Mounted by {@link DashboardSalesView} on `/dashboard`; `/walk-in`
 * redirects there. Repair graduated to Receiving `/repair`.
 *
 * Region contracts (contextual-display.md): Pickup/Sales are **Monitor** (read
 * feeds). Repair Workbench lives on `/repair`, not here.
 *
 * Layout is the boxed sidebar-mode recipe (workbench-shell.tsx): pinned
 * `WorkbenchChromeHeader` above a bounded flex body whose table sits in a
 * `WorkbenchTablePane` card — not the KPI-scrolls-away full-bleed shell.
 */

import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { zIndex } from '@/design-system/tokens/z-index';
import { WORKBENCH_CHROME_COLUMN } from '@/components/dashboard/workbench-shell';
import { WalkInDeskHeader } from '@/components/walk-in/WalkInDeskHeader';
import { SalesHistoryTable } from '@/components/walk-in/SalesHistoryTable';
import {
  PICKUP_TAB_ITEMS,
  SALES_TAB_ITEMS,
  defaultTabForMode,
  parsePickupTab,
  parseSalesTab,
  parseWalkInHistoryMode,
  type WalkInHistoryMode,
  type WalkInModeTab,
} from '@/lib/walk-in/history-modes';
import { walkInStationHref, type WalkInJob } from '@/lib/walk-in/jobs';

function TableFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

// Non-default tables are code-split so their chunks load only on mode switch.
const PickupOrdersTable = dynamic(
  () => import('@/components/walk-in/PickupOrdersTable').then((m) => m.PickupOrdersTable),
  { ssr: false, loading: TableFallback },
);

function tabItemsForMode(mode: WalkInHistoryMode): WalkInModeTab[] {
  if (mode === 'pickup') return PICKUP_TAB_ITEMS;
  return SALES_TAB_ITEMS;
}

/** The station job to open from the header for the active mode. */
const MODE_JOB: Record<WalkInHistoryMode, WalkInJob> = {
  pickup: 'pickup',
  sales: 'sales',
};

export function WalkInHistoryHub() {
  const router = useRouter();
  const pathname = usePathname() ?? '/walk-in';
  const searchParams = useSearchParams();

  const mode = parseWalkInHistoryMode(searchParams.get('mode'));
  const tabRaw = searchParams.get('tab');
  const tabItems = tabItemsForMode(mode);

  // The active tab, validated per mode (default falls through to the mode default).
  const activeTab =
    mode === 'pickup' ? parsePickupTab(tabRaw) : parseSalesTab(tabRaw);

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === defaultTabForMode(mode)) params.delete('tab');
      else params.set('tab', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [mode, pathname, router, searchParams],
  );

  const openStation = useCallback(() => {
    const job = MODE_JOB[mode];
    router.push(walkInStationHref(job));
  }, [mode, router]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
      <div className="relative shrink-0" style={{ zIndex: zIndex.header }}>
        <div className={WORKBENCH_CHROME_COLUMN}>
          <WalkInDeskHeader
            tabs={tabItems}
            activeTab={activeTab}
            onSelectTab={setTab}
            onOpenStation={openStation}
          />
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {mode === 'pickup' ? (
          <PickupOrdersTable tab={parsePickupTab(tabRaw)} />
        ) : (
          <SalesHistoryTable tab={parseSalesTab(tabRaw)} />
        )}
      </div>
    </div>
  );
}
