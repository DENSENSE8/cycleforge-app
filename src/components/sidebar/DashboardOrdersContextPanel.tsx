'use client';

import { useSearchParams } from 'next/navigation';
import UnshippedSidebar from '@/components/unshipped/UnshippedSidebar';
import { DashboardManagementPanel } from '@/components/sidebar/DashboardManagementPanel';
import { DashboardSearchSidebar } from '@/components/sidebar/dashboard/DashboardSearchSidebar';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { useShippedFormSubmit } from '@/components/sidebar/dashboard-sidebar-hooks';
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
 */
export function DashboardOrdersContextPanel() {
  const searchParams = useSearchParams();
  const dashboardSearch = useDashboardSearchController();
  const submitShippedForm = useShippedFormSubmit(dashboardSearch.closeIntakeForm);
  const mode = getDashboardModeFromSearch(searchParams);

  if (mode === 'search') return <DashboardSearchSidebar />;
  if (getDashboardDomainFromSearch(searchParams) === 'inbound') return null;

  const isOutbound =
    dashboardSearch.orderView === 'unshipped' || dashboardSearch.orderView === 'shipped';

  if (isOutbound) {
    return (
      <UnshippedSidebar
        embedded
        hideSectionHeader
        showIntakeForm={dashboardSearch.showIntakeForm}
        onCloseForm={dashboardSearch.closeIntakeForm}
        onFormSubmit={submitShippedForm}
        searchValue={dashboardSearch.searchQuery}
        onSearchChange={dashboardSearch.setSearch}
      />
    );
  }

  return (
    <DashboardManagementPanel
      showIntakeForm={dashboardSearch.showIntakeForm}
      onCloseForm={dashboardSearch.closeIntakeForm}
      onFormSubmit={submitShippedForm}
      searchValue={dashboardSearch.searchQuery}
      onSearchChange={dashboardSearch.setSearch}
    />
  );
}
