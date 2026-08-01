'use client';

import { useSearchParams } from 'next/navigation';
import UnshippedSidebar from '@/components/unshipped/UnshippedSidebar';
import { DashboardManagementPanel } from '@/components/sidebar/DashboardManagementPanel';
import { DashboardRecentsPanel } from '@/components/sidebar/dashboard/DashboardRecentsPanel';
import { WalkInHistorySidebar } from '@/components/walk-in/WalkInHistorySidebar';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { getDashboardDomainFromSearch } from '@/lib/dashboard/dashboard-domains';

/**
 * The Dashboard route's context panel — the stable sidebar picker/scope
 * for the dashboard Workbench (`.claude/rules/display/workbench.md`).
 *
 * Three domains (`getDashboardDomainFromSearch`), each with a picker:
 *   • outbound — the order feed (UnshippedSidebar / management panel)
 *   • inbound  — recents (`DashboardRecentsPanel`)
 *   • sales    — station hand-offs (`WalkInHistorySidebar`)
 *
 * Inbound used to `return null` here, so `/dashboard?mode=inbound` reserved a
 * 360px column and painted nothing in it; that void is the bug Phase 1.1 of
 * `docs/todo/dashboard-ia-rework-PLAN.md` closes. Outbound is the order feed
 * alone — no capped recents footer under the picker.
 *
 * New-order intake (`?new=true`) opens the shared detail-stack overlay
 * ({@link NewOrderEntryOverlay}) — same shell as `/shipping?new=true`.
 */
// TODO(daily-triage F0→F1): mount MyDayRail here pending OQ1
// (`docs/todo/daily-triage-FRONTEND-PLAN-VALIDATION.md`) — does the personal
// triage rail replace this picker, sit above it, or toggle with it? Unanswered
// by operators, so F0 mounts the rail on Home Today only and leaves this panel
// exactly as it is.
export function DashboardOrdersContextPanel() {
  const searchParams = useSearchParams();
  const dashboardSearch = useDashboardSearchController();
  const domain = getDashboardDomainFromSearch(searchParams);

  if (domain === 'inbound') {
    return <DashboardRecentsPanel />;
  }

  if (domain === 'sales') {
    return <WalkInHistorySidebar />;
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
      <NewOrderEntryOverlay
        open={dashboardSearch.showIntakeForm}
        onClose={dashboardSearch.closeIntakeForm}
      />
    </div>
  );
}
