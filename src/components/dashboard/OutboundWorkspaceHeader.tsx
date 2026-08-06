'use client';

/**
 * Outbound workspace chrome — To-ship Sheets flush stack (Unbox History recipe):
 *
 *   Band 1 — tabs + Import / Add
 *   Band 2 — KPI (DashboardOrdersView)
 *   Band 3 — find-only command row + Show/Hide inspector (View topics on rail)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  DASHBOARD_ORDER_VIEW_LABEL,
  isPrePackOrderView,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import { useToShipFilterHotkeys } from '@/components/dashboard/OutboundFilterStrip';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { OutboundOrderChromeActions } from '@/components/dashboard/OutboundOrderChromeActions';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { fulfillmentCountsFromCombos } from '@/lib/unshipped-state';
import { useOrdersViewChrome } from '@/components/outbound/orders/orders-view-chrome-context';
import { useRailActionSnapshot } from '@/components/dashboard/rail/OrderRailActions';
import { ColumnsTwo } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import {
  DETAIL_INSPECTOR_COLLAPSE_EVENT,
  getDetailInspectorCollapsed,
  setDetailInspectorCollapsed,
  toggleDetailInspectorCollapsed,
  type DetailInspectorCollapseDetail,
} from '@/design-system/shells/detail-stack';

const LIFECYCLE_VIEWS = ['unshipped', 'tested', 'packed', 'shipped'] as const;
type LifecycleView = (typeof LIFECYCLE_VIEWS)[number];

function isLifecycleView(view: DashboardOrderView): view is LifecycleView {
  return (
    view === 'unshipped' || view === 'tested' || view === 'packed' || view === 'shipped'
  );
}

export interface OutboundWorkspaceHeaderProps {
  orderView: DashboardOrderView;
  onSelectView: (view: DashboardOrderView) => void;
  className?: string;
}

/** Band 1 — tabs + trailing CTAs. Find / inspector park live on {@link OutboundTriageBand}. */
export function OutboundWorkspaceHeader({
  orderView,
  onSelectView,
  className,
}: OutboundWorkspaceHeaderProps) {
  const active = isLifecycleView(orderView) ? orderView : 'unshipped';
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());
  const { openIntakeForm } = useDashboardSearchController();

  const fromCombos = fulfillmentCountsFromCombos(queueCounts?.combos ?? []);
  const pendingCount =
    (fromCombos.PENDING || queueCounts?.byStage.pending || 0) + (fromCombos.BLOCKED || 0);
  const testedCount = fromCombos.TESTED || queueCounts?.byStage.tested || 0;

  const tabs = useMemo(
    () =>
      LIFECYCLE_VIEWS.map((id) => ({
        id,
        label: DASHBOARD_ORDER_VIEW_LABEL[id],
        count: id === 'unshipped' ? pendingCount : id === 'tested' ? testedCount : undefined,
        color: (id === 'unshipped'
          ? 'blue'
          : id === 'tested'
            ? 'teal'
            : id === 'packed'
              ? 'orange'
              : 'emerald') as 'blue' | 'teal' | 'orange' | 'emerald',
      })),
    [pendingCount, testedCount],
  );

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={active}
      onTabChange={(id) => onSelectView(id as DashboardOrderView)}
      solidTone="accent"
      className={className}
      trailing={
        <WorkbenchTrailingCluster
          actions={<OutboundOrderChromeActions onNewOrder={openIntakeForm} />}
        />
      }
    />
  );
}

/**
 * Band 3 — find-only command row (Unbox History golden): flex-1 search +
 * far-right Show/Hide inspector. Sheet refine / layout / KPI live on the
 * pushing right inspector View cluster.
 */
export function OutboundTriageBand({
  orderView,
  className,
}: {
  orderView: DashboardOrderView;
  className?: string;
}) {
  const active = isLifecycleView(orderView) ? orderView : 'unshipped';
  const { searchQuery, setSearch } = useDashboardSearchController();
  const { viewShellOpen, setViewShellOpen } = useOrdersViewChrome();
  const searchParams = useSearchParams();
  const { rows } = useRailActionSnapshot();
  const openOrderId = searchParams.get('openOrderId');
  const inspectorOpen =
    Boolean(openOrderId) || rows.length > 0 || viewShellOpen;

  const [inspectorCollapsed, setInspectorCollapsed] = useState(() =>
    getDetailInspectorCollapsed(),
  );

  useToShipFilterHotkeys(isPrePackOrderView(active));

  useEffect(() => {
    const onCollapse = (event: Event) => {
      const detail = (event as CustomEvent<DetailInspectorCollapseDetail>).detail;
      if (!detail || typeof detail.collapsed !== 'boolean') return;
      setInspectorCollapsed(detail.collapsed);
    };
    window.addEventListener(DETAIL_INSPECTOR_COLLAPSE_EVENT, onCollapse);
    return () => window.removeEventListener(DETAIL_INSPECTOR_COLLAPSE_EVENT, onCollapse);
  }, []);

  const toggleOrdersInspector = useCallback(() => {
    if (!inspectorOpen) {
      setViewShellOpen(true);
      setDetailInspectorCollapsed(false);
      setInspectorCollapsed(false);
      return;
    }
    toggleDetailInspectorCollapsed();
    setInspectorCollapsed(getDetailInspectorCollapsed());
  }, [inspectorOpen, setViewShellOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const isCmdBackslash =
        (e.metaKey || e.ctrlKey) && (e.key === '\\' || e.code === 'Backslash');
      const isBracket = !e.metaKey && !e.ctrlKey && !e.altKey && e.key === ']';
      if (!isCmdBackslash && !isBracket) return;
      e.preventDefault();
      toggleOrdersInspector();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleOrdersInspector]);

  const inspectorToggle = (
    <HoverTooltip
      label={
        !inspectorOpen
          ? 'Show inspector'
          : inspectorCollapsed
            ? 'Show inspector'
            : 'Hide inspector'
      }
      asChild
    >
      <IconButton
        size="sm"
        tone="neutral"
        ariaLabel={
          !inspectorOpen
            ? 'Show inspector'
            : inspectorCollapsed
              ? 'Show inspector'
              : 'Hide inspector'
        }
        aria-pressed={inspectorOpen && !inspectorCollapsed}
        icon={<ColumnsTwo className="h-4 w-4" />}
        onClick={toggleOrdersInspector}
        data-testid="orders-inspector-toggle"
      />
    </HoverTooltip>
  );

  return (
    <WorkbenchTriageBand
      className={className}
      search={
        <TechRailSearchBar
          variant="chrome"
          value={searchQuery}
          onChange={setSearch}
          placeholder="Filter orders…"
          className="min-w-0 flex-1"
        />
      }
      trailing={inspectorToggle}
    />
  );
}
