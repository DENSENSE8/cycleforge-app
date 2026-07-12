'use client';

/**
 * Outbound workspace chrome — one unified header bar for Dashboard · Outbound.
 *
 * Left:  lifecycle tabs (To Ship count only).
 * Right: [◀ exact filters…] [All N] | staff / table controls portal.
 *
 * Expand/collapse sits immediately left of All only — not next to the tabs.
 */

import { useMemo, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import {
  DASHBOARD_ORDER_VIEW_LABEL,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import {
  OutboundAllFilterButton,
  OutboundExactFilters,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
import { OutboundSavedViewChips } from '@/components/dashboard/OutboundSavedViewChips';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { cn } from '@/utils/_cn';

const LIFECYCLE_VIEWS = ['unshipped', 'packed', 'shipped'] as const;
type LifecycleView = (typeof LIFECYCLE_VIEWS)[number];

function isLifecycleView(view: DashboardOrderView): view is LifecycleView {
  return view === 'unshipped' || view === 'packed' || view === 'shipped';
}

export interface OutboundWorkspaceHeaderProps {
  orderView: DashboardOrderView;
  onSelectView: (view: DashboardOrderView) => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}

export function OutboundWorkspaceHeader({
  orderView,
  onSelectView,
  controlsSlotRef,
  className,
}: OutboundWorkspaceHeaderProps) {
  const active = isLifecycleView(orderView) ? orderView : 'unshipped';
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());
  useToShipFilterHotkeys(active === 'unshipped');

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
    <div
      className={cn(
        'flex min-w-0 shrink-0 items-center gap-3 rounded-2xl border border-border-soft bg-surface-card px-2.5 py-1.5 shadow-sm',
        className,
      )}
    >
      {/* Left — lifecycle tabs only */}
      <TabSwitch
        tabs={tabs}
        activeTab={active}
        onTabChange={(id) => onSelectView(id as DashboardOrderView)}
        className="w-auto shrink-0"
        highContrast
        countStyle="plain"
        railClassName="rounded-full bg-surface-sunken p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]"
      />

      <div className="min-w-0 flex-1" aria-hidden />

      {/* Right — [◀ filters] [All N] [saved view chips] | portal (staff, etc.) */}
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          <OutboundExactFilters mode={active} />
          <OutboundAllFilterButton mode={active} />
          <OutboundSavedViewChips mode={active} />
        </div>
        <div
          ref={controlsSlotRef}
          className="flex shrink-0 items-center gap-2"
          data-outbound-controls
        />
      </div>
    </div>
  );
}
