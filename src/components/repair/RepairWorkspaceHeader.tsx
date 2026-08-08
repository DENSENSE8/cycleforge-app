'use client';

/**
 * Repair workbench chrome — Sheets flush stack for dual-door RepairTable:
 * Scan Stations `/repair` (task/intake) and Sales `?mode=repairs` (history).
 * Sibling of `OutboundWorkspaceHeader` / `IncomingWorkspaceHeader`.
 *
 *   Band 1 — Active / Done lifecycle tabs (`?tab=`) + Add.
 *   Band 3 — [⌕ search] over `?search=` · icon sort (`RepairTriageBand`).
 *
 * Add on the Sales desk hands off to `/repair?new=true` (intake form mounts in
 * `RepairSidebarPanel` on the station only). Station Add sets `?new=true` in place.
 *
 * No KPI band (no metrics — honest absence). Favorites stay in
 * `RepairSidebarPanel`; queue chrome no longer lives there.
 */

import { useCallback, type Ref } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { QueueSortSwitch } from '@/components/dashboard/QueueSortSwitch';
import { WorkbenchInspectorToggle } from '@/components/dashboard/workbench-inspector-toggle';
import { useRightRailOccupantOpen } from '@/components/right-rail/useRightRailOccupant';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { useRepairDisplaySort } from '@/hooks/useRepairDisplaySort';
import { useRepairNewParam } from '@/hooks/useRepairNewParam';
import { REPAIR_DISPLAY_SORT_OPTIONS } from '@/lib/repair/repair-display-sort';
import {
  defaultRepairTabForSurface,
  isSalesRepairsDesk,
  parseRepairTab,
} from '@/lib/walk-in/history-modes';
import type { RepairTab } from '@/lib/neon/repair-service-queries';
import { RepairChromeActions } from './RepairChromeActions';

const REPAIR_TABS = [
  { id: 'active', label: 'Active', color: 'orange' as const },
  { id: 'done', label: 'Done', color: 'emerald' as const },
];

function useRepairChromeParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/repair', { scroll: false });
    },
    [pathname, router, searchParams],
  );
  return { router, pathname, searchParams, replaceParams };
}

/** Band 1 — Active / Done lifecycle tabs + Add. Find / sort live on {@link RepairTriageBand}. */
export function RepairWorkspaceHeader({ className }: { className?: string }) {
  const { router, pathname, searchParams, replaceParams } = useRepairChromeParams();
  const { openNew } = useRepairNewParam();
  const surfaceDefault = defaultRepairTabForSurface(pathname, searchParams);
  const onSalesDesk = isSalesRepairsDesk(pathname, searchParams);

  const activeTab = parseRepairTab(searchParams.get('tab'), surfaceDefault);
  // Incoming graduated off this queue — treat as Active for chrome selection.
  const chromeTab: Exclude<RepairTab, 'incoming'> =
    activeTab === 'done' ? 'done' : 'active';

  const setTab = useCallback(
    (id: string) => {
      replaceParams((params) => {
        if (id === surfaceDefault) params.delete('tab');
        else params.set('tab', id);
      });
    },
    [replaceParams, surfaceDefault],
  );

  const openNewRepair = useCallback(() => {
    // Intake form only mounts on the station rail — Sales hands off.
    if (onSalesDesk) {
      router.push('/repair?new=true');
      return;
    }
    openNew();
  }, [onSalesDesk, openNew, router]);

  return (
    <WorkbenchChromeHeader
      density="band"
      className={className}
      tabs={REPAIR_TABS}
      activeTab={chromeTab}
      onTabChange={setTab}
      solidTone="accent"
      trailing={
        <WorkbenchTrailingCluster
          actions={<RepairChromeActions onAdd={openNewRepair} />}
        />
      }
    />
  );
}

/** Band 3 — find left; icon sort right. No KPI band. */
export function RepairTriageBand({
  className,
  controlsSlotRef,
}: {
  className?: string;
  controlsSlotRef?: Ref<HTMLDivElement>;
}) {
  const { searchParams, replaceParams } = useRepairChromeParams();
  const { sort, setSort } = useRepairDisplaySort();
  const urlSearch = searchParams.get('search') ?? '';
  const repairInspectorOpen = useRightRailOccupantOpen('detail:repair');

  const setRepairSearch = useCallback(
    (next: string) => {
      replaceParams((params) => {
        const trimmed = next.trim();
        if (trimmed) params.set('search', trimmed);
        else params.delete('search');
      });
    },
    [replaceParams],
  );

  return (
    <WorkbenchTriageBand
      className={className}
      controlsSlotRef={controlsSlotRef}
      search={
        <TechRailSearchBar
          variant="chrome"
          value={urlSearch}
          onChange={setRepairSearch}
          placeholder="Filter repairs, tickets, SKU…"
          className="min-w-0 flex-1"
        />
      }
      trailing={
        <WorkbenchInspectorToggle open={repairInspectorOpen} testId="repair-inspector-toggle" />
      }
      right={
        <QueueSortSwitch
          sort={sort}
          onChange={setSort}
          options={REPAIR_DISPLAY_SORT_OPTIONS}
          ariaLabel="Sort repairs"
          variant="icon"
        />
      }
    />
  );
}
