'use client';

/**
 * Sales hub — front-desk history surface: Local Pickup · Sales · Repairs
 * (dashboard L2 modes `?mode=pickup|sales|repairs`). Mounted by
 * {@link DashboardSalesView} on `/dashboard`; `/walk-in` redirects there.
 *
 * Region contracts (contextual-display.md): Pickup/Sales are **Monitor** (read
 * feeds). Repairs composes the shared {@link RepairTable} workbench as the
 * **history door** — Scan Stations `/repair` remains the intake/task door.
 *
 * Layout for Sales/Pickup is the Sheets flush stack: pinned flush
 * `WalkInDeskHeader` (Band 1 tabs) above the mode feed. Repairs skips that
 * header — `RepairTable` owns `RepairWorkspaceHeader` / triage.
 */

import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { zIndex } from '@/design-system/tokens/z-index';
import { WalkInDeskHeader } from '@/components/walk-in/WalkInDeskHeader';
import { SalesHistoryTable } from '@/components/walk-in/SalesHistoryTable';
import {
  DEFAULT_SALES_REPAIR_TAB,
  PICKUP_TAB_ITEMS,
  SALES_TAB_ITEMS,
  defaultTabForMode,
  parsePickupTab,
  parseRepairTab,
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

const RepairTable = dynamic(
  () => import('@/components/repair/RepairTable').then((m) => m.RepairTable),
  { ssr: false, loading: TableFallback },
);

function tabItemsForMode(mode: WalkInHistoryMode): WalkInModeTab[] {
  if (mode === 'pickup') return PICKUP_TAB_ITEMS;
  return SALES_TAB_ITEMS;
}

/** The station job to open from the header for Sales / Pickup modes. */
const MODE_JOB: Record<'pickup' | 'sales', WalkInJob> = {
  pickup: 'pickup',
  sales: 'sales',
};

export function WalkInHistoryHub() {
  const router = useRouter();
  const pathname = usePathname() ?? '/walk-in';
  const searchParams = useSearchParams();

  const mode = parseWalkInHistoryMode(searchParams.get('mode'));
  const tabRaw = searchParams.get('tab');
  const isRepairs = mode === 'repairs';
  const feedMode: 'pickup' | 'sales' = mode === 'pickup' ? 'pickup' : 'sales';
  const tabItems = tabItemsForMode(feedMode);
  const activeTab =
    feedMode === 'pickup' ? parsePickupTab(tabRaw) : parseSalesTab(tabRaw);

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === defaultTabForMode(feedMode)) params.delete('tab');
      else params.set('tab', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [feedMode, pathname, router, searchParams],
  );

  const openStation = useCallback(() => {
    router.push(walkInStationHref(MODE_JOB[feedMode]));
  }, [feedMode, router]);

  // Repairs: RepairTable owns its chrome — no WalkInDeskHeader double band.
  if (isRepairs) {
    return (
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
        <RepairTable filter={parseRepairTab(tabRaw, DEFAULT_SALES_REPAIR_TAB)} />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
      <div className="relative shrink-0" style={{ zIndex: zIndex.header }}>
        <div className={WORKBENCH_SHEET_CHROME}>
          <WalkInDeskHeader
            tabs={tabItems}
            activeTab={activeTab}
            onSelectTab={setTab}
            onOpenStation={openStation}
            className="rounded-none border-l-0 border-t-0 shadow-sm"
          />
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {feedMode === 'pickup' ? (
          <PickupOrdersTable tab={parsePickupTab(tabRaw)} />
        ) : (
          <SalesHistoryTable tab={parseSalesTab(tabRaw)} />
        )}
      </div>
    </div>
  );
}
