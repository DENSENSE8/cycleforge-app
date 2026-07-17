'use client';

import { useSearchParams } from 'next/navigation';
import UnshippedSidebar from '@/components/unshipped/UnshippedSidebar';
import { DashboardManagementPanel } from '@/components/sidebar/DashboardManagementPanel';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { useShippedFormSubmit } from '@/components/sidebar/dashboard-sidebar-hooks';
import { getDashboardDomainFromSearch } from '@/lib/dashboard/dashboard-domains';

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
 *
 * The dashboard's OTHER domain — Inbound (`?mode=inbound`, receiving cartons) —
 * has no context panel: its search + facet filters live in the content chrome
 * (`InboundWorkspaceHeader`), and mounting the outbound order feed beside a
 * carton table is exactly the domain intermix the FOH/BOH split forbids.
 */
export function DashboardOrdersContextPanel() {
  const searchParams = useSearchParams();
  const dashboardSearch = useDashboardSearchController();
  const submitShippedForm = useShippedFormSubmit(dashboardSearch.closeIntakeForm);

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
