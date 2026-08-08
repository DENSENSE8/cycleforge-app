'use client';

/**
 * Shipping workspace chrome — Sheets flush stack (Unbox / Pack recipe):
 *
 *   Band 1 — tabs (Urgent · Pending · All · History) + New Order
 *   Band 2 — KPI (`WorkbenchKpiBand` in ShippingWorkspaceView)
 *   Band 3 — triage: search · filters / staff · portal
 *
 * Row select lives in the table left gutter (always on), not chrome.
 */

import { useMemo, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  OutboundExactFilters,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { WorkbenchKpiCollapseToggle } from '@/components/dashboard/workbench-kpi-collapse';
import { OutboundOrderChromeActions } from '@/components/dashboard/OutboundOrderChromeActions';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import {
  SHIPPING_WORKSPACE_TAB_LABEL,
  SHIPPING_WORKSPACE_TABS,
  type ShippingWorkspaceTab,
} from '@/utils/shipping-workspace-state';

const TAB_COLOR: Record<ShippingWorkspaceTab, 'red' | 'blue' | 'gray' | 'emerald'> = {
  urgent: 'red',
  pending: 'blue',
  all: 'gray',
  history: 'emerald',
};

/** Band 1 — tabs + New Order. Search / filters live on {@link ShippingTriageBand}. */
export function ShippingWorkspaceHeader({
  tab,
  onSelectTab,
  onNewOrder,
  className,
}: {
  tab: ShippingWorkspaceTab;
  onSelectTab: (tab: ShippingWorkspaceTab) => void;
  /** Open new-order entry (slide-over). */
  onNewOrder?: () => void;
  className?: string;
}) {
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());

  const tabs = useMemo(
    () =>
      SHIPPING_WORKSPACE_TABS.map((id) => ({
        id,
        label: SHIPPING_WORKSPACE_TAB_LABEL[id],
        count:
          id === 'pending'
            ? queueCounts?.total
            : id === 'urgent'
              ? queueCounts?.urgent
              : undefined,
        color: TAB_COLOR[id],
        dividerBefore: id === 'history',
      })),
    [queueCounts?.total, queueCounts?.urgent],
  );

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as ShippingWorkspaceTab)}
      solidTone="accent"
      className={className}
      trailing={
        onNewOrder ? (
          <WorkbenchTrailingCluster
            actions={<OutboundOrderChromeActions onNewOrder={onNewOrder} />}
          />
        ) : undefined
      }
    />
  );
}

/** Band 3 — find left; filters / staff · portal right. Leading = Unbox KPI collapse. */
export function ShippingTriageBand({
  tab,
  controlsSlotRef,
  kpiOpen,
  onToggleKpi,
  className,
}: {
  tab: ShippingWorkspaceTab;
  controlsSlotRef?: Ref<HTMLDivElement>;
  /** Band 2 open — drives {@link WorkbenchKpiCollapseToggle}. */
  kpiOpen: boolean;
  onToggleKpi: () => void;
  className?: string;
}) {
  const { searchQuery, setSearch } = useWorkbenchSearchParam();
  const queueTab = tab === 'pending' || tab === 'urgent';
  useToShipFilterHotkeys(queueTab);

  const search =
    queueTab || tab === 'all' ? (
      <TechRailSearchBar
        variant="chrome"
        value={searchQuery}
        onChange={setSearch}
        placeholder={
          tab === 'urgent'
            ? 'Filter urgent orders…'
            : tab === 'all'
              ? 'Search all triage…'
              : 'Filter orders…'
        }
        className="min-w-0 flex-1"
      />
    ) : null;

  // Queue lane toggles stay in the right zone — a compound Urgent + Filters
  // cluster, not a single field-density glyph. History has no find field at all
  // (honest absence), so its staff facet has no in-field slot to move into.
  const right =
    queueTab ? (
      <OutboundExactFilters mode="unshipped" />
    ) : tab === 'history' ? (
      <StaffFilterButton
        iconOnly
        allLabel="All technicians"
        allToken="all"
        meLabel="You"
      />
    ) : null;

  return (
    <WorkbenchTriageBand
      className={className}
      kpiToggle={
        <WorkbenchKpiCollapseToggle open={kpiOpen} onToggle={onToggleKpi} />
      }
      search={search}
      right={right}
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-shipping-controls': '' }}
    />
  );
}
