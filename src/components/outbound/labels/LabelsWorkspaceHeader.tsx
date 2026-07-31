'use client';

/**
 * Labels-station workspace chrome — tabs left (Queue · Recent), station filters
 * (search + Urgent/lane like Dashboard · To Ship) right, then sort + primary
 * Import / Add CTAs. Mirrors ShippingWorkspaceHeader / OutboundWorkspaceHeader
 * for `/shipping` labels.
 */

import { useMemo, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WorkbenchChromeHeader, WorkbenchTrailingCluster } from '@/components/dashboard/workbench-shell';
import {
  OutboundExactFilters,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { OutboundOrderChromeActions } from '@/components/dashboard/OutboundOrderChromeActions';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ArrowUpDown } from '@/components/Icons';
import {
  awaitingLabelsQuery,
  stagedOrdersQuery,
} from '@/lib/queries/outbound-queries';
import {
  OUTBOUND_SORT_OPTIONS,
  type OutboundSort,
} from '@/components/outbound/outbound-sidebar-shared';
import {
  LABELS_WORKSPACE_TAB_LABEL,
  type LabelsWorkspaceTab,
} from '@/utils/labels-workspace-state';

const TABS: LabelsWorkspaceTab[] = ['queue', 'recent'];

const SORT_LABEL: Record<OutboundSort, string> = Object.fromEntries(
  OUTBOUND_SORT_OPTIONS.map((o) => [o.id, o.label]),
) as Record<OutboundSort, string>;

interface LabelsWorkspaceHeaderProps {
  tab: LabelsWorkspaceTab;
  onSelectTab: (tab: LabelsWorkspaceTab) => void;
  search: string;
  onSearch: (value: string) => void;
  sort: OutboundSort;
  onToggleSort: () => void;
  /** Open the New-order entry form (slide-over) — moved off the dashboard. */
  onNewOrder: () => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}

/** Ghost icon-only Priority ⇄ Newest sort toggle (no fill color at rest). */
function SortToggle({ sort, onToggle }: { sort: OutboundSort; onToggle: () => void }) {
  return (
    <HoverTooltip label={`Sort: ${SORT_LABEL[sort]} — tap to change`} asChild>
      <ToolbarButton
        type="button"
        iconOnly
        onClick={onToggle}
        aria-label={`Sort: ${SORT_LABEL[sort]}`}
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
      </ToolbarButton>
    </HoverTooltip>
  );
}

export function LabelsWorkspaceHeader({
  tab,
  onSelectTab,
  search,
  onSearch,
  sort,
  onToggleSort,
  onNewOrder,
  controlsSlotRef,
  className,
}: LabelsWorkspaceHeaderProps) {
  // Counts share the same feeds the tables + KPI strip read (React Query dedupes),
  // so tab badges never drift from the list below.
  const { data: awaiting } = useQuery(awaitingLabelsQuery({ searchQuery: '' }));
  const { data: staged } = useQuery(stagedOrdersQuery({ searchQuery: '' }));
  useToShipFilterHotkeys(tab === 'queue');

  const tabs = useMemo(
    () =>
      TABS.map((id) => ({
        id,
        label: LABELS_WORKSPACE_TAB_LABEL[id],
        count: id === 'queue' ? awaiting?.length : staged?.length,
        color: (id === 'queue' ? 'blue' : 'emerald') as 'blue' | 'emerald',
        dividerBefore: id === 'recent',
      })),
    [awaiting?.length, staged?.length],
  );

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as LabelsWorkspaceTab)}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-labels-controls': '' }}
      className={className}
      search={
        <ToolbarSearchToggle
          value={search}
          onChange={onSearch}
          onClear={() => onSearch('')}
          placeholder="Filter order #, SKU, title…"
          tone="blue"
        />
      }
      // Same Urgent + lane popover as Dashboard · To Ship / Shipping · Pending.
      right={tab === 'queue' ? <OutboundExactFilters mode="unshipped" /> : undefined}
      trailing={
        <WorkbenchTrailingCluster
          sort={<SortToggle sort={sort} onToggle={onToggleSort} />}
          actions={<OutboundOrderChromeActions onNewOrder={onNewOrder} />}
        />
      }
    />
  );
}
