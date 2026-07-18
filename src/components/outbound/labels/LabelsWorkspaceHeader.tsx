'use client';

/**
 * Labels-station workspace chrome — tabs left (Queue · Recent), station filters
 * (search + sort) and the Import/Sync control right. Mirrors
 * ShippingWorkspaceHeader / the golden WorkbenchChromeHeader recipe for the
 * `/outbound` labels station (docs/todo/display-convergence-log.md → Axis 5).
 */

import { useMemo, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { OrdersSyncPopover } from '@/components/unshipped/OrdersSyncPopover';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ArrowUpDown, Plus } from '@/components/Icons';
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

/** Compact sort toggle (Priority ⇄ Newest) matching the chrome control cluster. */
function SortToggle({ sort, onToggle }: { sort: OutboundSort; onToggle: () => void }) {
  return (
    <HoverTooltip label={`Sort: ${SORT_LABEL[sort]} — tap to change`} asChild>
      <button
        type="button"
        onClick={onToggle}
        // ds-raw-button: a two-state segmented sort toggle, not a single-variant action Button.
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border-soft bg-surface-card px-3 text-role-caption font-semibold text-text-muted transition-colors hover:bg-surface-hover hover:text-text-default"
      >
        <ArrowUpDown className="h-3.5 w-3.5 opacity-70" />
        {sort === 'newest' ? 'Newest' : 'Priority'}
      </button>
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
      right={<SortToggle sort={sort} onToggle={onToggleSort} />}
      trailing={
        <>
          {/* ds-raw-button: emerald "create" affordance — DS Button has no success variant (matches the retired sidebar New-order button). */}
          <button
            type="button"
            onClick={onNewOrder}
            aria-label="New order entry"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-emerald-500 px-3 text-white shadow-sm transition-colors hover:bg-emerald-600 active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-role-eyebrow font-bold uppercase tracking-widest text-white">
              New order
            </span>
          </button>
          <OrdersSyncPopover triggerVariant="header" />
        </>
      }
    />
  );
}
