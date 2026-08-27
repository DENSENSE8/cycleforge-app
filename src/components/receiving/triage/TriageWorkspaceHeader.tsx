'use client';

/**
 * Triage (Arrival) workspace chrome — Sheets flush stack (Unbox / To-ship recipe):
 *
 *   Band 1 — tabs (Triage · Prioritize · Unfound · Done) · Check · Add · Arrival
 *   Band 2 — KPI (`WorkbenchKpiBand` in TriageWorkspaceView)
 *   Band 3 — triage: carton filter (`?triq=`) · staff · KPI-collapse kpiToggle
 *
 * Box-station Add shares {@link ReceivingBoxChromeActions} with Unbox — between
 * Check and the return-to-scan CTA. Not the Incoming Import cluster.
 *
 * House Band-1 law (Unbox golden · To-ship desk exemplar): fixed process tabs
 * for every staffer — never Chrome-style unpin of a system stage · Pin-list cube
 * omitted (honest absence — no closed foreign-collection catalog) · no page Views
 * yet (honest absence; if added they mount on Band 3, never Band-1 leading) ·
 * page-pin in GlobalHeader. Three pin scopes never share a trigger/store. SoT:
 * source-of-truth.md → Workbench Band-1 strip · Left-edge → SCOPE decides its home.
 */

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  WorkbenchChromeHeader,
  WorkbenchTrailingCluster,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { WorkbenchKpiCollapseToggle } from '@/components/dashboard/workbench-kpi-collapse';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { StaffFilterRows } from '@/components/ui/StaffFilterButton';
import { WorkbenchFilterPopover } from '@/components/dashboard/workbench-filter-popover';
import { STAFF_FILTER_PARAM } from '@/hooks/useStaffFilter';
import { ReceivingModeArrival } from '@/components/icons/stations';
import { ReceivingBoxChromeActions } from '@/components/receiving/ReceivingBoxChromeActions';
import {
  IncomingDeskRightRail,
  type IncomingDeskRailTool,
} from '@/components/sidebar/receiving/incoming/IncomingDeskRightRail';
import { emitReceiving } from '@/components/receiving/receiving-events';
import {
  TRIAGE_WORKSPACE_TAB_LABEL,
  type TriageWorkspaceTab,
} from '@/utils/triage-workspace-state';

// Active-work tabs first; Done (history-like) sits rightmost with a divider —
// mirrors UnboxWorkspaceHeader (Queue · Viewed · History).
// Rail bulk-dismiss uses the row ⋮ menu's "Select" verb, not chrome.
const TABS: TriageWorkspaceTab[] = ['triage', 'found', 'unfound', 'done'];

/** Band 1 — lifecycle tabs + Check · Add · Arrival resume. */
export function TriageWorkspaceHeader({
  tab,
  onSelectTab,
  className,
}: {
  tab: TriageWorkspaceTab;
  onSelectTab: (tab: TriageWorkspaceTab) => void;
  className?: string;
}) {
  const [deskRail, setDeskRail] = useState<IncomingDeskRailTool | null>(null);

  const { data: unfoundCount } = useQuery({
    queryKey: ['triage-unfound-badge'] as const,
    queryFn: async () => {
      // `count_only=1`. Without it this route's `total` is the PAGE size, so
      // `limit=1` answered 1 and the badge showed 1 for any non-empty queue.
      const params = new URLSearchParams({
        kind: 'unmatched_receiving',
        count_only: '1',
        limit: '1',
        offset: '0',
      });
      const res = await fetch(`/api/receiving/unfound-queue?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return 0;
      const body = (await res.json()) as { total?: number; rows?: unknown[] };
      if (typeof body.total === 'number') return body.total;
      return Array.isArray(body.rows) ? body.rows.length : 0;
    },
    staleTime: 20_000,
  });

  const handleReturnToArrival = useCallback(() => {
    onSelectTab('triage');
    setTimeout(() => {
      emitReceiving('receiving-focus-scan');
    }, 60);
  }, [onSelectTab]);

  const tabs = TABS.map((id) => ({
    id,
    label: TRIAGE_WORKSPACE_TAB_LABEL[id],
    count:
      id === 'unfound' && typeof unfoundCount === 'number' && unfoundCount > 0
        ? unfoundCount
        : undefined,
    color: (id === 'found'
      ? 'orange'
      : id === 'unfound'
        ? 'orange'
        : id === 'done'
          ? 'emerald'
          : 'blue') as 'blue' | 'orange' | 'emerald',
    dividerBefore: id === 'done',
  }));

  return (
    <>
      <WorkbenchChromeHeader
        density="band"
        tabs={tabs}
        activeTab={tab}
        onTabChange={(id) => onSelectTab(id as TriageWorkspaceTab)}
        solidTone="accent"
        className={className}
        trailing={
          <WorkbenchTrailingCluster
            actions={
              <ReceivingBoxChromeActions
                onCheck={() => setDeskRail({ kind: 'check', checkOnly: true })}
                onAdd={() => setDeskRail({ kind: 'add', platform: 'amazon', leaf: 'index' })}
                resumeLabel="Arrival"
                resumeAriaLabel="Arrival"
                resumeIcon={<ReceivingModeArrival />}
                onResume={handleReturnToArrival}
              />
            }
          />
        }
      />
      <IncomingDeskRightRail tool={deskRail} onClose={() => setDeskRail(null)} />
    </>
  );
}

/** Read/write the Triage carton filter (`?triq=`) — same param the sidebar owns. */
function useTriageFilterParam() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get('triq') ?? '';
  const setValue = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set('triq', trimmed);
      else params.delete('triq');
      const qs = params.toString();
      const base = pathname || '/';
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  return { value, setValue };
}

/**
 * Band 3 — find-only: dominant carton filter with the staff facet in-field, as
 * ROWS of the one refine funnel. It used to paint its own `User` glyph in the
 * field; the field carries a single mark and that mark is the funnel
 * (`workbench-filter-popover.tsx` → the one-icon law).
 */
export function TriageTriageBand({
  kpiOpen,
  onToggleKpi,
  className,
}: {
  kpiOpen: boolean;
  onToggleKpi: () => void;
  className?: string;
}) {
  const { value, setValue } = useTriageFilterParam();
  const searchParams = useSearchParams();
  const [refineOpen, setRefineOpen] = useState(false);

  return (
    <WorkbenchTriageBand
      className={className}
      kpiToggle={<WorkbenchKpiCollapseToggle open={kpiOpen} onToggle={onToggleKpi} />}
      search={
        <TechRailSearchBar
          variant="chrome"
          value={value}
          onChange={setValue}
          placeholder="Filter arrivals…"
          className="min-w-0 flex-1"
          trailingSuffix={
            <WorkbenchFilterPopover
              open={refineOpen}
              onOpenChange={setRefineOpen}
              hot={Boolean(searchParams.get(STAFF_FILTER_PARAM))}
              label="Refine"
              density="field"
            >
              <StaffFilterRows onPick={() => setRefineOpen(false)} />
            </WorkbenchFilterPopover>
          }
        />
      }
    />
  );
}
