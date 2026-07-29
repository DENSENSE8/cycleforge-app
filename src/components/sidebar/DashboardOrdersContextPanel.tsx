'use client';

import { useSearchParams } from 'next/navigation';
import UnshippedSidebar from '@/components/unshipped/UnshippedSidebar';
import { DashboardManagementPanel } from '@/components/sidebar/DashboardManagementPanel';
import {
  DashboardRecentsFooter,
  DashboardRecentsPanel,
} from '@/components/sidebar/dashboard/DashboardRecentsPanel';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { getDashboardDomainFromSearch } from '@/lib/dashboard/dashboard-domains';

/**
 * The Dashboard route's context panel — the stable sidebar picker/scope
 * for the dashboard Workbench (`.claude/rules/display/workbench.md`).
 *
 * Two domains (`getDashboardDomainFromSearch`), each with a picker:
 *   • outbound — the order feed (UnshippedSidebar / management panel)
 *   • inbound  — recents (see below)
 *
 * **Recents render in BOTH domains.** Inbound used to `return null` here, so
 * `/dashboard?mode=inbound` reserved a 360px column and painted nothing in it;
 * that void is the bug Phase 1.1 of `docs/todo/dashboard-ia-rework-PLAN.md`
 * closes. Outbound keeps the order feed as its primary picker and takes recents
 * as a capped footer beneath it, so re-opening the last carton/order you touched
 * never costs a mode switch — which is what Search mode's recents list was
 * actually being used for.
 *
 * New-order intake (`?new=true`) opens the shared detail-stack overlay
 * ({@link NewOrderEntryOverlay}) — same shell as `/shipping?new=true`.
 */
export function DashboardOrdersContextPanel() {
  const searchParams = useSearchParams();
  const dashboardSearch = useDashboardSearchController();

  if (getDashboardDomainFromSearch(searchParams) === 'inbound') {
    return <DashboardRecentsPanel />;
  }

  const isOutbound =
    dashboardSearch.orderView === 'unshipped' ||
    dashboardSearch.orderView === 'tested' ||
    dashboardSearch.orderView === 'packed' ||
    dashboardSearch.orderView === 'shipped';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {isOutbound ? (
          <UnshippedSidebar
            embedded
            hideSectionHeader
            searchValue={dashboardSearch.searchQuery}
            onSearchChange={dashboardSearch.setSearch}
          />
        ) : (
          <DashboardManagementPanel
            searchValue={dashboardSearch.searchQuery}
            onSearchChange={dashboardSearch.setSearch}
          />
        )}
      </div>
      <DashboardRecentsFooter />
      <NewOrderEntryOverlay
        open={dashboardSearch.showIntakeForm}
        onClose={dashboardSearch.closeIntakeForm}
      />
    </div>
  );
}
