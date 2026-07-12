'use client';

import UnshippedSidebar from '@/components/unshipped/UnshippedSidebar';
import { DashboardManagementPanel } from '@/components/sidebar/DashboardManagementPanel';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { useShippedFormSubmit } from '@/components/sidebar/dashboard-sidebar-hooks';

/**
 * The Dashboard route's context panel — the stable sidebar picker/scope
 * for the dashboard Workbench (`.claude/rules/display/workbench.md`).
 *
 * Consolidated (2026-07): Unshipped and Shipped share ONE "Outbound" sidebar (a
 * lean order-feed: search filters the active tab, new-order entry, sync + the
 * onboarding/ROI cards). The Unshipped ⇄ Shipped split lives as a top-left TAB in
 * the main content (`DashboardOrdersView`). Warranty Logger moved to
 * Support (`/support?mode=warranty`); `?fba` is owned by the top-level `/fba`
 * page and has no rail entry here.
 */
export function DashboardOrdersContextPanel() {
  const dashboardSearch = useDashboardSearchController();
  const submitShippedForm = useShippedFormSubmit(dashboardSearch.closeIntakeForm);

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
