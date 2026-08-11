'use client';

/**
 * Labels-station workspace chrome — Sheets flush stack (Unbox / To-ship recipe):
 *
 *   Band 1 — tabs (Queue · Recent) + solid Import / Add CTAs
 *   Band 2 — KPI (`WorkbenchKpiBand` in LabelsWorkspaceView)
 *   Band 3 — triage: search · Urgent/lane filters · icon-sort · KPI-collapse kpiToggle
 *
 * House Band-1 law (Unbox golden · To-ship desk exemplar): fixed process tabs
 * for every staffer — never Chrome-style unpin of a system stage · Pin-list cube
 * omitted (honest absence — no closed foreign-collection catalog) · no page Views
 * yet (honest absence; if added they mount on Band 3, never Band-1 leading) ·
 * page-pin in GlobalHeader. Three pin scopes never share a trigger/store. SoT:
 * source-of-truth.md → Workbench Band-1 strip · Left-edge → SCOPE decides its home.
 */

import { useMemo, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WorkbenchChromeHeader, WorkbenchTrailingCluster, WorkbenchTriageBand } from '@/components/dashboard/workbench-shell';
import { WorkbenchKpiCollapseToggle } from '@/components/dashboard/workbench-kpi-collapse';
import {
  OutboundExactFilters,
  useToShipFilterHotkeys,
} from '@/components/dashboard/OutboundFilterStrip';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
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
  /** Open the New-order entry form (slide-over) — moved off the dashboard. */
  onNewOrder: () => void;
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

/** Band 1 — lifecycle tabs + solid Import / Add CTAs. Find / filters / sort live on {@link LabelsTriageBand}. */
export function LabelsWorkspaceHeader({
  tab,
  onSelectTab,
  onNewOrder,
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
      density="band"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as LabelsWorkspaceTab)}
      solidTone="accent"
      className={className}
      trailing={
        <WorkbenchTrailingCluster
          // Band 1 trailing is solid Import · Add only — no hairline pair.
          divide={false}
          actions={<OutboundOrderChromeActions onNewOrder={onNewOrder} />}
        />
      }
    />
  );
}

/** Band 3 — search left; Urgent/lane filters · icon-sort right. Leading = Unbox KPI collapse. */
export function LabelsTriageBand({
  tab,
  search,
  onSearch,
  sort,
  onToggleSort,
  kpiOpen,
  onToggleKpi,
  controlsSlotRef,
  className,
}: {
  tab: LabelsWorkspaceTab;
  search: string;
  onSearch: (value: string) => void;
  sort: OutboundSort;
  onToggleSort: () => void;
  kpiOpen: boolean;
  onToggleKpi: () => void;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}) {
  useToShipFilterHotkeys(tab === 'queue');

  return (
    <WorkbenchTriageBand
      className={className}
      controlsSlotRef={controlsSlotRef}
      kpiToggle={<WorkbenchKpiCollapseToggle open={kpiOpen} onToggle={onToggleKpi} />}
      search={
        <TechRailSearchBar
          variant="chrome"
          value={search}
          onChange={onSearch}
          placeholder="Filter order #, SKU, title…"
          className="min-w-0 flex-1"
        />
      }
      right={
        <>
          {tab === 'queue' ? <OutboundExactFilters mode="unshipped" /> : null}
          <SortToggle sort={sort} onToggle={onToggleSort} />
        </>
      }
    />
  );
}
