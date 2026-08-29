'use client';

/**
 * Pack workspace chrome — Sheets flush stack (Unbox / To-ship recipe):
 *
 *   Band 1 — tabs (Queue | History) + New Order
 *   Band 2 — KPI (PackWorkspaceView)
 *   Band 3 — triage: search · filters / staff · portal
 *
 * Row select lives in the table left gutter (always on), not chrome.
 *
 * House Band-1 law (Unbox golden · To-ship desk exemplar): fixed process tabs
 * for every staffer — never Chrome-style unpin of a system stage · Pin-list cube
 * omitted (honest absence — no closed foreign-collection catalog) · Views on
 * Band 3 (`WorkbenchViewsMenu` in the triage `views` slot, never Band-1 leading)
 * · page-pin in GlobalHeader. Three pin scopes never share a trigger/store. SoT:
 * source-of-truth.md → Workbench Band-1 strip · Left-edge → SCOPE decides its home.
 */

import { useEffect, useMemo, type Ref } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { OutboundOrderChromeActions } from '@/components/dashboard/OutboundOrderChromeActions';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import { useWorkbenchSearchParam } from '@/hooks/useWorkbenchSearchParam';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import {
  PACK_WORKSPACE_TAB_LABEL,
  type PackWorkspaceTab,
} from '@/utils/pack-workspace-state';
import { WorkbenchViewsMenu } from '@/components/saved-views/WorkbenchViewsMenu';
import {
  SAVED_VIEW_PARAM_KEYS,
  SAVED_VIEW_STORAGE_KEY,
} from '@/lib/station/table-url-params';

const TABS: PackWorkspaceTab[] = ['queue', 'history'];

/** Band 1 — tabs + New Order. Search / filters live on {@link PackTriageBand}. */
export function PackWorkspaceHeader({
  tab,
  onSelectTab,
  onNewOrder,
  className,
}: {
  tab: PackWorkspaceTab;
  onSelectTab: (tab: PackWorkspaceTab) => void;
  /** Open new-order entry (slide-over). */
  onNewOrder?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: queueCounts } = useQuery(unshippedQueueCountsQuery());

  // Pack Queue opens on the TESTED (ready-to-pack) lane when no ustatus is set.
  useEffect(() => {
    if (tab !== 'queue') return;
    if (String(searchParams.get('ustatus') || '').trim()) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('ustatus', 'TESTED');
    const qs = params.toString();
    const base = pathname || '/pack';
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
  }, [tab, searchParams, pathname, router]);

  const tabs = useMemo(
    () =>
      TABS.map((id) => ({
        id,
        label: PACK_WORKSPACE_TAB_LABEL[id],
        count: id === 'queue' ? (queueCounts?.byStage.tested ?? queueCounts?.total) : undefined,
        color: (id === 'queue' ? 'teal' : 'emerald') as 'teal' | 'emerald',
        dividerBefore: id === 'history',
      })),
    [queueCounts?.byStage.tested, queueCounts?.total],
  );

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as PackWorkspaceTab)}
      solidTone="accent"
      className={className}
      trailing={
        onNewOrder ? (
          <WorkbenchTrailingCluster
            // Band 1 trailing is solid Import · Add only — no hairline pair.
            divide={false}
            actions={<OutboundOrderChromeActions onNewOrder={onNewOrder} />}
          />
        ) : undefined
      }
    />
  );
}

/** Band 3 — find left; filters / staff · portal right. Leading = Unbox KPI collapse. */
export function PackTriageBand({
  tab,
  controlsSlotRef,
  className,
}: {
  tab: PackWorkspaceTab;
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}) {
  const { searchQuery, setSearch } = useWorkbenchSearchParam();
  useToShipFilterHotkeys(tab === 'queue');

  const search =
    tab === 'queue' ? (
      <TechRailSearchBar
        variant="chrome"
        value={searchQuery}
        onChange={setSearch}
        placeholder="Filter ready-to-pack…"
        className="min-w-0 flex-1"
      />
    ) : null;

  // Queue lane toggles stay in the right zone — a compound Urgent + Filters
  // cluster, not a single field-density glyph. History has no find field
  // (honest absence), so its staff facet has no in-field slot to move into.
  const right =
    tab === 'queue' ? (
      <OutboundExactFilters mode="unshipped" />
    ) : (
      <StaffFilterButton
        iconOnly
        allLabel="All packers"
        allToken="all"
        meLabel="You"
      />
    );

  return (
    <WorkbenchTriageBand
      className={className}
      views={
        tab === 'history' ? (
          <WorkbenchViewsMenu
            storageKey={SAVED_VIEW_STORAGE_KEY.packer_history}
            paramKeys={SAVED_VIEW_PARAM_KEYS.packer_history}
            emptyHint="No saved views yet — refine Pack History, then save it here."
          />
        ) : null
      }
      search={search ?? <div className="min-w-0 flex-1" />}
      right={right}
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-pack-controls': '' }}
    />
  );
}
