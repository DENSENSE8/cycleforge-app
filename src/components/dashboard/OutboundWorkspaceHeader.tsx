'use client';

/**
 * Outbound workspace chrome — one unified header bar for Dashboard · Outbound.
 *
 * Left:  lifecycle tabs (To Ship count only).
 * Right: [⚡] [⫶] | staff / columns / options portal | Select (far right).
 */

import { useMemo, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DASHBOARD_ORDER_VIEW_LABEL,
  type DashboardOrderView,
  type DashboardPendingLayout,
} from '@/utils/dashboard-search-state';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import {
  OutboundExactFilters,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { BoardSelectToggle } from '@/components/board/BoardSelectToggle';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { useDashboardSearchController } from '@/hooks/useDashboardSearchController';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';

const LIFECYCLE_VIEWS = ['unshipped', 'packed', 'shipped'] as const;
type LifecycleView = (typeof LIFECYCLE_VIEWS)[number];

function isLifecycleView(view: DashboardOrderView): view is LifecycleView {
  return view === 'unshipped' || view === 'packed' || view === 'shipped';
}

export interface OutboundWorkspaceHeaderProps {
  orderView: DashboardOrderView;
  onSelectView: (view: DashboardOrderView) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  /** Select pencil — always far-right in chrome (not portaled from the table). */
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
  className?: string;
}

export function OutboundWorkspaceHeader({
  orderView,
  onSelectView,
  controlsSlotRef,
  selectMode = false,
  onToggleSelectMode,
  className,
}: OutboundWorkspaceHeaderProps) {
  const active = isLifecycleView(orderView) ? orderView : 'unshipped';
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());
  const { searchQuery, setSearch, pendingLayout, setPendingLayout } = useDashboardSearchController();
  useToShipFilterHotkeys(active === 'unshipped');

  // Pending-only board|grid switch: the vertical shelf-board vs the flat
  // spreadsheet grid view. Lives in the chrome (table/board-primary region), not
  // a ?mode= sidebar.
  const pendingLayoutToggle =
    active === 'unshipped' ? (
      <HorizontalButtonSlider
        variant="nav"
        dense
        aria-label="Pending layout"
        value={pendingLayout}
        onChange={(id) => setPendingLayout(id as DashboardPendingLayout)}
        items={[
          { id: 'board', label: 'Board' },
          { id: 'grid', label: 'Grid' },
        ]}
      />
    ) : null;

  // Counts only on To Ship; Packed/Shipped stay label-only.
  const tabs = useMemo(
    () =>
      LIFECYCLE_VIEWS.map((id) => ({
        id,
        label: DASHBOARD_ORDER_VIEW_LABEL[id],
        count: id === 'unshipped' ? queueCounts?.total : undefined,
        color: (id === 'unshipped' ? 'blue' : id === 'packed' ? 'orange' : 'emerald') as
          | 'blue'
          | 'orange'
          | 'emerald',
      })),
    [queueCounts?.total],
  );

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={active}
      onTabChange={(id) => onSelectView(id as DashboardOrderView)}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-outbound-controls': '' }}
      className={className}
      // Scoped list filter over ?search= (header slot) — the ⌘K pill stays global.
      search={
        <ToolbarSearchToggle
          value={searchQuery}
          onChange={setSearch}
          onClear={() => setSearch('')}
          placeholder="Filter orders…"
          tone="blue"
        />
      }
      // [⚡] [⫶ lane/status] — All + saved views live in filter / table options.
      // Select-all for To Ship lives in the table column header (grip + ☐), not
      // a trailing pencil — keep the chrome pencil only for Packed / Shipped.
      right={<OutboundExactFilters mode={active} />}
      trailing={
        active === 'unshipped' ? (
          pendingLayoutToggle
        ) : onToggleSelectMode ? (
          <BoardSelectToggle active={selectMode} onToggle={onToggleSelectMode} />
        ) : undefined
      }
    />
  );
}
