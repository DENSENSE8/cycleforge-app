'use client';

/**
 * Repair workbench chrome — golden `WorkbenchChromeHeader` for `/repair`
 * (and Walk-In station `?job=repair`). Sibling of `OutboundWorkspaceHeader` /
 * `IncomingWorkspaceHeader`.
 *
 * Left:   Active / Done lifecycle tabs (`?tab=`).
 * Right:  [⌕ search] over `?search=`.
 * Trailing: Add (new repair intake via `?new=true` — sidebar owns the overlay).
 *
 * Favorites stay in `RepairSidebarPanel`; queue chrome no longer lives there.
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { WorkbenchChromeHeader, WorkbenchTrailingCluster } from '@/components/dashboard/workbench-shell';
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

export function RepairWorkspaceHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sort, setSort } = useRepairDisplaySort();

  const activeTab = parseRepairTab(searchParams.get('tab'));
  // Incoming graduated off this queue — treat as Active for chrome selection.
  const chromeTab: Exclude<RepairTab, 'incoming'> =
    activeTab === 'done' ? 'done' : 'active';

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/repair', { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setTab = useCallback(
    (id: string) => {
      replaceParams((params) => {
        if (id === DEFAULT_REPAIR_TAB || id === 'active') params.delete('tab');
        else params.set('tab', id);
      });
    },
    [replaceParams],
  );

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

  const openNewRepair = useCallback(() => {
    replaceParams((params) => {
      params.set('new', 'true');
    });
  }, [replaceParams]);

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={REPAIR_TABS}
      activeTab={chromeTab}
      onTabChange={setTab}
      solidTone="accent"
      search={
        <TechRailSearchBar
          variant="chrome"
          value={urlSearch}
          onChange={setRepairSearch}
          placeholder="Filter repairs, tickets, SKU…"
          className="w-40 shrink-0 lg:w-56"
        />
      }
      trailing={
        <WorkbenchTrailingCluster
          sort={
            <QueueSortSwitch
              sort={sort}
              onChange={setSort}
              options={REPAIR_DISPLAY_SORT_OPTIONS}
              ariaLabel="Sort repairs"
            />
          }
          actions={<RepairChromeActions onAdd={openNewRepair} />}
        />
      }
    />
  );
}
