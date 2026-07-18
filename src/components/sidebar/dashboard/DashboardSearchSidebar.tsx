'use client';

/**
 * Dashboard · Search sidebar — the signed-in staffer's most-recently-searched
 * list (the map under the master-nav L2 rail).
 *
 * Query typing lives in the global header pill (contextual search, wired by
 * {@link DashboardSearchView} via `usePageHeaderSearch`); this panel never
 * mounts its own search band. Recents are DB-backed + per-staff
 * (`useStaffSearchRecents` → `search_recents`), so they follow a staffer across
 * devices and survive a cache wipe. Selecting a recent re-runs it by navigating
 * back to the Search mode with `?q=` (the row is a real Link), rendered by the
 * shared `SearchRecentsDropdown`.
 */

import { Clock, Loader2 } from '@/components/Icons';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SidebarSection } from '@/components/layout/SidebarSection';
import { SearchRecentsDropdown } from '@/components/search/SearchRecentsDropdown';
import { useStaffSearchRecents } from '@/hooks/useStaffSearchRecents';
import { DASHBOARD_SEARCH_RECENTS_SCOPE } from '@/components/dashboard/search/dashboard-search-recents';

export function DashboardSearchSidebar() {
  const { recents, isLoading, remove, clear } = useStaffSearchRecents({
    scope: DASHBOARD_SEARCH_RECENTS_SCOPE,
  });

  return (
    <SidebarShell
      headerAbove={
        <SidebarSection band>
          <span className="flex items-center gap-1.5 text-role-eyebrow font-black uppercase tracking-widest text-text-soft">
            <Clock className="h-3 w-3" />
            Recent searches
          </span>
        </SidebarSection>
      }
      bodyClassName="!pt-2 pb-6"
    >
      {isLoading && recents.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-role-caption text-text-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : recents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas inset-empty text-center text-role-caption text-text-soft">
          Your recent searches will appear here. Search from the field above.
        </div>
      ) : (
        <SearchRecentsDropdown
          recents={recents}
          onRemove={remove}
          onClearAll={clear}
          className="-mx-1.5"
        />
      )}
    </SidebarShell>
  );
}
