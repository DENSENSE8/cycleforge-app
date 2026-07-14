'use client';

/**
 * Operations ▸ Plans — sidebar (the master picker for the Plans workbench).
 *
 * Search + plan list over GET /api/ops-plans; selection writes `?open=<planId>`
 * (URL is the state SoT). Live via the org `ops_plans:changes` channel —
 * a bridge sync or any plan mutation refreshes the list without polling.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/utils/_cn';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { getOpsPlansChannelName, safeChannelName } from '@/lib/realtime/channels';
import { Sparkles } from '@/components/Icons';
import { SearchBar } from '@/components/ui/SearchBar';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import type { PlanRow } from '@/lib/ops-plans/types';
import {
  OPS_PLANS_LIST_KEY,
  MASTER_PLAN_OPS_TITLE,
  PLAN_STATUS_TONE,
  fetchPlansList,
} from './plans-shared';

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function PlansSidebar({ modeToggle }: { modeToggle: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const q = searchParams.get('q') ?? '';
  const openPlanId = searchParams.get('open') ?? '';

  const setParam = useCallback(
    (key: 'q' | 'open', value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!params.get('mode')) params.set('mode', 'plans');
      if (value) params.set(key, value);
      else params.delete(key);
      // Switching selection drops live console — reopen via the detail toggle.
      if (key === 'open') params.delete('view');
      router.replace(`/operations?${params.toString()}`);
    },
    [router, searchParams],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: [...OPS_PLANS_LIST_KEY, q],
    queryFn: () => fetchPlansList(q),
    staleTime: 30_000,
  });

  // Live refresh: bridge syncs + plan mutations publish ops_plan.updated.
  const channel = safeChannelName(() => (user ? getOpsPlansChannelName(user.organizationId) : ''));
  const onPlanUpdated = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: OPS_PLANS_LIST_KEY });
    void queryClient.invalidateQueries({ queryKey: ['ops-plans', 'detail'] });
  }, [queryClient]);
  useAblyChannel(channel, 'ops_plan.updated', onPlanUpdated, !!channel);

  const plans = useMemo(() => data?.plans ?? [], [data?.plans]);

  return (
    <SidebarShell bodyClassName="pt-0 pb-6">
      {modeToggle}
      {/* In-context list filter — local base SearchBar. The global header pill
          stays global. */}
      <div className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
        <SearchBar
          size="compact"
          variant="blue"
          value={q}
          onChange={(next) => setParam('q', next || null)}
          onClear={() => setParam('q', null)}
          placeholder="Filter plans…"
          isSearching={isLoading && q.length > 0}
        />
      </div>
      <div className="pt-3">
        {isLoading && plans.length === 0 && (
          <p className="py-6 text-center text-role-caption text-text-faint">Loading plans…</p>
        )}
        {isError && (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-3 py-4 text-center text-role-caption text-rose-700">
            Could not load plans.
          </div>
        )}
        {!isLoading && !isError && plans.length === 0 && (
          <p className="py-6 text-center text-role-caption text-text-faint">
            {q ? 'No plans match this search.' : 'No plans yet. Plans appear here once created — including the auto-synced agentic master plan.'}
          </p>
        )}

        <ul className="divide-y divide-border-hairline">
          {plans.map((plan: PlanRow) => {
            const selected = plan.id === openPlanId;
            const isMasterPlan = plan.title === MASTER_PLAN_OPS_TITLE;
            const pct = plan.progress?.percentComplete ?? 0;
            return (
              <li key={plan.id}>
                {/* ds-raw-button: sidebar row (list rows use bare buttons per house rows) */}
                <button
                  type="button"
                  onClick={() => setParam('open', selected ? null : plan.id)}
                  className={cn(
                    'w-full rounded-md px-2 py-1.5 text-left transition-colors',
                    selected ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'hover:bg-surface-hover',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 truncate text-role-caption font-bold text-text-default">
                      {isMasterPlan && (
                        <HoverTooltip label="Auto-synced from the agentic-loop master plan — open Live in the detail pane" focusable={false}>
                          <span className="inline-flex">
                            <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                          </span>
                        </HoverTooltip>
                      )}
                      <span className="truncate">{plan.title}</span>
                    </p>
                    <span
                      className={cn(
                        'shrink-0 rounded inset-chip text-role-micro uppercase tracking-widest ring-1 ring-inset',
                        PLAN_STATUS_TONE[plan.status] ?? PLAN_STATUS_TONE.draft,
                      )}
                    >
                      {plan.status}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <ProgressBar percent={pct} />
                    <span className="shrink-0 text-role-micro font-bold tabular-nums text-text-soft">{Math.round(pct)}%</span>
                  </div>
                  <p className="mt-1 truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
                    {plan.progress ? `${plan.progress.doneTasks}/${plan.progress.totalTasks} tasks` : '—'}
                    {plan.targetDate ? ` · due ${plan.targetDate}` : ''}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </SidebarShell>
  );
}
