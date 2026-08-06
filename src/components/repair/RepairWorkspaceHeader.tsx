'use client';

/**
 * Repair workbench chrome — Sheets flush stack for `/repair` (and Walk-In
 * station `?job=repair`). Sibling of `OutboundWorkspaceHeader` /
 * `IncomingWorkspaceHeader`.
 *
 *   Band 1 — Active / Done lifecycle tabs (`?tab=`) + Add (`?new=true`).
 *   Band 3 — [⌕ search] over `?search=` · icon sort (`RepairTriageBand`).
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
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { useRepairDisplaySort } from '@/hooks/useRepairDisplaySort';
import { REPAIR_DISPLAY_SORT_OPTIONS } from '@/lib/repair/repair-display-sort';
import {
  DEFAULT_REPAIR_TAB,
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
  return { searchParams, replaceParams };
}

/** Band 1 — Active / Done lifecycle tabs + Add. Find / sort live on {@link RepairTriageBand}. */
export function RepairWorkspaceHeader({ className }: { className?: string }) {
  const { searchParams, replaceParams } = useRepairChromeParams();

  const activeTab = parseRepairTab(searchParams.get('tab'));
  // Incoming graduated off this queue — treat as Active for chrome selection.
  const chromeTab: Exclude<RepairTab, 'incoming'> =
    activeTab === 'done' ? 'done' : 'active';

  const setTab = useCallback(
    (id: string) => {
      replaceParams((params) => {
        if (id === DEFAULT_REPAIR_TAB || id === 'active') params.delete('tab');
        else params.set('tab', id);
      });
    },
    [replaceParams],
  );

  const openNewRepair = useCallback(() => {
    replaceParams((params) => {
      params.set('new', 'true');
    });
  }, [replaceParams]);

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
          className="w-40 shrink-0 lg:w-56"
        />
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
