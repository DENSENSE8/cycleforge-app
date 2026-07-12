'use client';

import { ShieldCheck, Truck } from '@/components/Icons';
import {
  HorizontalButtonSlider,
  type HorizontalSliderItem,
} from '@/components/ui/HorizontalButtonSlider';
import { SidebarSection } from '@/components/layout/SidebarSection';
import UnshippedSidebar from '@/components/unshipped/UnshippedSidebar';
import { WarrantyLoggerSidebar } from '@/components/warranty/WarrantyLoggerSidebar';
import { DashboardManagementPanel } from '@/components/sidebar/DashboardManagementPanel';
import { useMasterNavEnabled } from '@/components/sidebar/master-nav';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { useShippedFormSubmit } from '@/components/sidebar/dashboard-sidebar-hooks';

/**
 * The Orders / Shipping route's context panel — the stable sidebar picker/scope
 * for the dashboard Workbench (`.claude/rules/display/workbench.md`).
 *
 * Consolidated (2026-07): Unshipped and Shipped share ONE "Outbound" sidebar (a
 * lean order-feed: search filters the active tab, new-order entry, sync + the
 * onboarding/ROI cards). The Unshipped ⇄ Shipped split moved to a top-left TAB in
 * the main content (`DashboardOrdersView`), so this panel no longer forks a
 * separate Shipped sidebar. `?warranty` keeps its own sidebar; `?fba` is owned by
 * the top-level `/fba` page and has no rail entry here.
 */
export function DashboardOrdersContextPanel() {
  const dashboardSearch = useDashboardSearchController();
  const masterNavEnabled = useMasterNavEnabled();
  const submitShippedForm = useShippedFormSubmit(dashboardSearch.closeIntakeForm);

  // Outbound (unshipped/shipped) and Warranty are the two dashboard modes; the
  // Unshipped/Shipped choice is a tab in the main content, not a sidebar switch.
  const isOutbound = dashboardSearch.orderView === 'unshipped' || dashboardSearch.orderView === 'shipped';
  const activeMode = dashboardSearch.orderView === 'warranty' ? 'warranty' : 'outbound';

  const subviewItems: HorizontalSliderItem[] = [
    { id: 'outbound', label: 'Outbound', icon: Truck },
    { id: 'warranty', label: 'Warranty Logger', icon: ShieldCheck },
  ];

  // Legacy in-panel switcher — only when master nav is off (standalone / tests).
  // 'outbound' resolves to the default `?unshipped` tab.
  const filterControl = masterNavEnabled ? null : (
    <SidebarSection band>
      <HorizontalButtonSlider
        items={subviewItems}
        value={activeMode}
        onChange={(mode) => dashboardSearch.setOrderView(mode === 'warranty' ? 'warranty' : 'unshipped')}
        variant="segmented"
        aria-label="Orders view"
        className="w-full"
      />
    </SidebarSection>
  );

  if (isOutbound) {
    return (
      <UnshippedSidebar
        embedded
        hideSectionHeader
        showIntakeForm={dashboardSearch.showIntakeForm}
        onCloseForm={dashboardSearch.closeIntakeForm}
        onFormSubmit={submitShippedForm}
        filterControl={filterControl}
        searchValue={dashboardSearch.searchQuery}
        onSearchChange={dashboardSearch.setSearch}
      />
    );
  }

  if (dashboardSearch.orderView === 'warranty') {
    return (
      <WarrantyLoggerSidebar
        filterControl={filterControl}
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
      filterControl={filterControl}
      searchValue={dashboardSearch.searchQuery}
      onSearchChange={dashboardSearch.setSearch}
    />
  );
}
