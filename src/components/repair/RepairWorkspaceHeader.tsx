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

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { QueueSortSwitch } from '@/components/dashboard/QueueSortSwitch';
import { GridFieldsMenu } from '@/components/ui/table-column-config/GridFieldsMenu';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { REPAIR_GRID_COLUMNS } from '@/lib/repair/repair-grid-layout';
import { useDebounce } from '@/hooks';
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
  const [draft, setDraft] = useState(urlSearch);
  useEffect(() => {
    setDraft(urlSearch);
  }, [urlSearch]);
  const debouncedDraft = useDebounce(draft, 250);
  useEffect(() => {
    if (debouncedDraft.trim() === urlSearch.trim()) return;
    replaceParams((params) => {
      const next = debouncedDraft.trim();
      if (next) params.set('search', next);
      else params.delete('search');
    });
  }, [debouncedDraft, replaceParams, urlSearch]);

  const openNewRepair = useCallback(() => {
    replaceParams((params) => {
      params.set('new', 'true');
    });
  }, [replaceParams]);

  return (
    <WorkbenchChromeHeader
      tabs={REPAIR_TABS}
      activeTab={chromeTab}
      onTabChange={setTab}
      solidTone="accent"
      search={
        <ToolbarSearchToggle
          value={draft}
          onChange={setDraft}
          onClear={() => {
            setDraft('');
            replaceParams((params) => {
              params.delete('search');
            });
          }}
          placeholder="Filter repairs, tickets, SKU…"
          tone="blue"
        />
      }
      trailing={
        <div className="flex items-center gap-2">
          {/* Per-staff column picker — the opt-in path for the `optional`
              tracks (phone · price · order) the lean default hides. */}
          <GridFieldsMenu tableId="repair" columns={REPAIR_GRID_COLUMNS} />
          <QueueSortSwitch
            sort={sort}
            onChange={setSort}
            options={REPAIR_DISPLAY_SORT_OPTIONS}
            ariaLabel="Sort repairs"
          />
          <RepairChromeActions onAdd={openNewRepair} />
        </div>
      }
    />
  );
}
