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
 * Layout for Sales/Pickup is the Sheets flush stack: the mode's status tabs
 * sit above the feed as legal second-level sub-modes. Repairs mounts the same
 * sub-mode strip above `RepairTable`.
 */

import { useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink } from '@/components/Icons';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { TableTabs } from '@/components/tables/TableStatusBar';
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
const PickupWorkspace = dynamic(
  () => import('@/components/receiving/pickup/PickupWorkspace').then((m) => m.PickupWorkspace),
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

const REPAIR_TAB_ITEMS: WalkInModeTab[] = [
  { id: 'incoming', label: 'Incoming' },
  { id: 'active', label: 'Active' },
  { id: 'done', label: 'Done' },
];

/** The station job to open from the Sales desk action. */
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
  const tabItems = isRepairs ? REPAIR_TAB_ITEMS : tabItemsForMode(feedMode);
  const activeTab = isRepairs
    ? parseRepairTab(tabRaw, DEFAULT_SALES_REPAIR_TAB)
    : feedMode === 'pickup'
      ? parsePickupTab(tabRaw)
      : parseSalesTab(tabRaw);
  const defaultTab = isRepairs
    ? DEFAULT_SALES_REPAIR_TAB
    : defaultTabForMode(feedMode);

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === defaultTab) params.delete('tab');
      else params.set('tab', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [defaultTab, pathname, router, searchParams],
  );

  const openStation = useCallback(() => {
    router.push(
      isRepairs
        ? walkInStationHref('repair', { new: 'true' })
        : walkInStationHref(MODE_JOB[feedMode]),
    );
  }, [feedMode, isRepairs, router]);

  const stationAction = useMemo(
    () => (
      <DeskHeaderAction
        type="button"
        variant="secondary"
        size="sm"
        icon={<ExternalLink aria-hidden className="h-3.5 w-3.5" />}
        onClick={openStation}
      >
        Open station
      </DeskHeaderAction>
    ),
    [openStation],
  );

  const submodeTabs = (
    <div className="shrink-0 border-b border-border-soft bg-surface-card">
      <TableTabs
        tabs={tabItems}
        activeTab={activeTab}
        onTabChange={setTab}
        className="border-0 bg-transparent"
      />
    </div>
  );

  // Repairs: the shared table owns the table surface; its Incoming / Active /
  // Done filters stay as second-level sub-modes inside the Repair Service page tab.
  if (isRepairs) {
    return (
      <>
        <DeskActionSlotRegistrar>{stationAction}</DeskActionSlotRegistrar>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
          {submodeTabs}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <RepairTable filter={parseRepairTab(tabRaw, DEFAULT_SALES_REPAIR_TAB)} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <DeskActionSlotRegistrar>{stationAction}</DeskActionSlotRegistrar>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
        {submodeTabs}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {feedMode === 'pickup' ? (
            <PickupWorkspace
              statusTabOverride={parsePickupTab(tabRaw) === 'completed' ? 'done' : 'draft'}
              showStatusFilter={false}
            />
          ) : (
            <SalesHistoryTable tab={parseSalesTab(tabRaw)} />
          )}
        </div>
      </div>
    </>
  );
}
