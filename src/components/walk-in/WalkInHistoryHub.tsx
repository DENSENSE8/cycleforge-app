'use client';

/**
 * Sales hub (`/walk-in`) — the front-desk history surface, now a **3-mode hub**
 * that mirrors the dashboard's outbound pattern (modes in the sidebar, per-mode
 * tabs that swap between genuinely separate tables).
 *
 * - **Mode** (`?mode=pickup|sales|repair`, default `sales`) is owned by the
 *   sidebar mode rail (`WalkInModeSlider`). Modes ≠ tabs.
 * - **Tab** (`?tab=`, validated per mode, default dropped) is the top-header tab
 *   band (`WalkInDeskHeader`) — each tab is its own table.
 *
 * Region contracts (contextual-display.md): Pickup/Sales are **Monitor** (read
 * feeds); Repair mounts `RepairTable`, a **Workbench** region (durable selection
 * + Square-payment actions) — a page may host several contracts, one per region.
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
import { useAuth } from '@/contexts/AuthContext';
import {
  PICKUP_TAB_ITEMS,
  REPAIR_TAB_ITEMS,
  SALES_TAB_ITEMS,
  WALK_IN_MODE_PERMISSION,
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
  if (mode === 'repair') return REPAIR_TAB_ITEMS;
  return SALES_TAB_ITEMS;
}

/** The station job to open from the header for the active mode. */
const MODE_JOB: Record<WalkInHistoryMode, WalkInJob> = {
  pickup: 'pickup',
  sales: 'sales',
  repair: 'repair',
};

export function WalkInHistoryHub() {
  const router = useRouter();
  const pathname = usePathname() ?? '/walk-in';
  const searchParams = useSearchParams();
  const { has } = useAuth();

  const mode = parseWalkInHistoryMode(searchParams.get('mode'));
  const tabRaw = searchParams.get('tab');
  const tabItems = tabItemsForMode(mode);

  // The active tab, validated per mode (default falls through to the mode default).
  const activeTab =
    mode === 'pickup'
      ? parsePickupTab(tabRaw)
      : mode === 'repair'
        ? parseRepairTab(tabRaw)
        : parseSalesTab(tabRaw);

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
    router.push(
      job === 'repair' ? walkInStationHref('repair', { new: 'true' }) : walkInStationHref(job),
    );
  }, [mode, router]);

  const requiredPermission = WALK_IN_MODE_PERMISSION[mode];
  const modeAllowed = requiredPermission == null || has(requiredPermission);

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
        {!modeAllowed ? (
          <div className="flex flex-1 items-center justify-center bg-surface-canvas px-6">
            <div className="rounded-xl border border-dashed border-border-soft bg-surface-card px-6 py-10 text-center">
              <p className="text-role-caption font-bold text-text-default">Repair access needed</p>
              <p className="mt-1 text-role-micro text-text-soft">
                You don&apos;t have permission to view repairs. Ask an admin for repair access.
              </p>
            </div>
          </div>
        ) : mode === 'pickup' ? (
          <PickupOrdersTable tab={parsePickupTab(tabRaw)} />
        ) : mode === 'repair' ? (
          <RepairTable filter={parseRepairTab(tabRaw)} />
        ) : (
          <SalesHistoryTable tab={parseSalesTab(tabRaw)} />
        )}
      </div>
    </div>
  );
}
