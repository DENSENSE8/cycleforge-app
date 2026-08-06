'use client';

/**
 * Triage (Arrival) workspace chrome — Sheets flush stack (Unbox / To-ship recipe):
 *
 *   Band 1 — tabs (Triage · Prioritize · Unfound · Done)
 *   Band 2 — KPI (`WorkbenchKpiBand` in TriageWorkspaceView)
 *   Band 3 — triage: carton filter (`?triq=`) · staff · KPI-collapse kpiToggle
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  WorkbenchChromeHeader,
  WorkbenchTriageBand,
} from '@/components/dashboard/workbench-shell';
import { WorkbenchKpiCollapseToggle } from '@/components/dashboard/workbench-kpi-collapse';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { StaffFilterButton } from '@/components/ui/StaffFilterButton';
import {
  TRIAGE_WORKSPACE_TAB_LABEL,
  type TriageWorkspaceTab,
} from '@/utils/triage-workspace-state';

// Active-work tabs first; Done (history-like) sits rightmost with a divider —
// mirrors UnboxWorkspaceHeader (Queue · Viewed · History).
// Rail bulk-dismiss uses the sidebar RailEditPencil, not chrome.
const TABS: TriageWorkspaceTab[] = ['triage', 'found', 'unfound', 'done'];

/** Band 1 — lifecycle tabs only. Find / staff live on {@link TriageTriageBand}. */
export function TriageWorkspaceHeader({
  tab,
  onSelectTab,
  className,
}: {
  tab: TriageWorkspaceTab;
  onSelectTab: (tab: TriageWorkspaceTab) => void;
  className?: string;
}) {
  const { data: unfoundCount } = useQuery({
    queryKey: ['triage-unfound-badge'] as const,
    queryFn: async () => {
      const params = new URLSearchParams({
        kind: 'unmatched_receiving',
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
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as TriageWorkspaceTab)}
      solidTone="accent"
      className={className}
    />
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

/** Band 3 — carton filter left; staff right. Leading = Unbox KPI collapse. */
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
          className="w-40 shrink-0 lg:w-56"
        />
      }
      right={<StaffFilterButton iconOnly align="end" />}
    />
  );
}
