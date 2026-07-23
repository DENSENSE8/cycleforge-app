'use client';

import { useSearchParams } from 'next/navigation';
import UnshippedSidebar from '@/components/unshipped/UnshippedSidebar';
import { DashboardManagementPanel } from '@/components/sidebar/DashboardManagementPanel';
import { DashboardSearchSidebar } from '@/components/sidebar/dashboard/DashboardSearchSidebar';
import { NewOrderEntryOverlay } from '@/components/orders/NewOrderEntryOverlay';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import {
  getDashboardDomainFromSearch,
  getDashboardModeFromSearch,
} from '@/lib/dashboard/dashboard-domains';

/**
 * The Dashboard route's context panel — the stable sidebar picker/scope
 * for the dashboard Workbench (`.claude/rules/display/workbench.md`).
 *
 * Modes (master-nav L2 rail):
 *   • Search    — recent order searches; header pill drives `/dashboard?mode=search&q=`
 *   • Receiving — inbound cartons (no order-feed sidebar)
 *   • Shipping  — outbound order feed (UnshippedSidebar / management)
 *
 * New-order intake (`?new=true`) opens the shared detail-stack overlay
 * ({@link NewOrderEntryOverlay}) — same shell as `/shipping?new=true`.
 */
export function DashboardOrdersContextPanel() {
  const searchParams = useSearchParams();
  const dashboardSearch = useDashboardSearchController();
  const mode = getDashboardModeFromSearch(searchParams);

  if (mode === 'search') return <DashboardSearchSidebar />;
  if (getDashboardDomainFromSearch(searchParams) === 'inbound') return null;

  const isOutbound =
    dashboardSearch.orderView === 'unshipped' || dashboardSearch.orderView === 'shipped';

  return (
    <>
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
      <NewOrderEntryOverlay
        open={dashboardSearch.showIntakeForm}
        onClose={dashboardSearch.closeIntakeForm}
      />
    </>
  );
}
