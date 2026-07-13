'use client';

/**
 * Agentic-loop live console — Monitor (MDX) + plan agent + optional Hermes run
 * feed. Reused by Operations ▸ Plans (?view=live on the bridged plan) and by
 * the /forge redirect target. Run history stays adjacent (cycle_forge_runs) —
 * it is NOT projected into ops_plan_tasks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EventTimeline } from '@/components/ui/EventTimeline';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cycleForgeStepsToTimeline, type CycleForgeStepRow } from '@/lib/timeline/cycle-forge';
import { useMasterPlanDoc } from '@/hooks/useMasterPlanDoc';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { getForgeRunsChannelName, safeChannelName } from '@/lib/realtime/channels';
import { scanTicketStatuses, rollupTicketStatuses } from '@/lib/master-plan/ticket-status';
import { MasterPlanView } from '@/components/forge/MasterPlanView';
import { PlanAgentChat } from '@/components/forge/PlanAgentChat';
import { Loader2 } from '@/components/Icons';

interface ForgeRun {
  id: number;
  run_uid: string;
  feature_request: string;
  branch: string | null;
  manifest_path: string | null;
  status: string;
  git_diff_stat: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps: CycleForgeStepRow[];
}

const STATUS_BADGE: Record<string, string> = {
  running: 'bg-blue-50 text-blue-700',
  passed: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
  error: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-surface-sunken text-text-muted',
};

const PLAN_STATUS_DOT: Record<string, { dot: string; label: string }> = {
  idle: { dot: 'bg-surface-inverse-soft', label: 'Waiting for session' },
  connecting: { dot: 'bg-amber-500', label: 'Connecting to the live plan' },
  live: { dot: 'bg-emerald-500', label: 'Live — edits merge in real time' },
  error: { dot: 'bg-rose-500', label: 'Realtime unavailable' },
};

export function AgenticLoopLiveConsole({ showRuns = true }: { showRuns?: boolean }) {
  const { user, has } = useAuth();
  const plan = useMasterPlanDoc();
  const [runs, setRuns] = useState<ForgeRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const r = await fetch('/api/forge/runs', { cache: 'no-store' });
      const d = (await r.json()) as { success: boolean; runs?: ForgeRun[]; error?: string };
      if (d.success && d.runs) {
        setRuns(d.runs);
        setError(null);
      } else {
        setError(d.error ?? 'Failed to load runs');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showRuns) {
      setLoading(false);
      return;
    }
    void fetchRuns();
  }, [fetchRuns, showRuns]);

  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runsChannel = safeChannelName(() => (user ? getForgeRunsChannelName(user.organizationId) : ''));
  const onRunChanged = useCallback(() => {
    if (!showRuns) return;
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void fetchRuns(), 300);
  }, [fetchRuns, showRuns]);
  useAblyChannel(runsChannel, 'forge_run.changed', onRunChanged, !!runsChannel && showRuns);

  const rollup = useMemo(() => rollupTicketStatuses(scanTicketStatuses(plan.mdx)), [plan.mdx]);
  const planDot = PLAN_STATUS_DOT[plan.status] ?? PLAN_STATUS_DOT.idle;
  const showChat = plan.canEdit && has('assistant.chat');

  if (!plan.canView) {
    return (
      <div className="rounded-xl border border-dashed border-border-default bg-surface-sunken px-4 py-6 text-center text-role-caption text-text-muted">
        You need operations.plans.view to open the live master plan.
      </div>
    );
  }

  // Two scroll regions inside a height-bounded host (OperationsPlansView live
  // pane). Left = master-plan MDX (Monitor); right = plan agent + run history.
  // Parent main is overflow-hidden — without min-h-0 + overflow-y-auto here the
  // long ROI MDX is clipped and the right column cannot scroll independently.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:gap-8">
      {/* Plan MDX — independent scroll on lg+; flows in page scroll on mobile */}
      <section className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <p className="text-role-eyebrow uppercase tracking-[0.18em] text-text-faint">Master plan</p>
          <HoverTooltip label={planDot.label} focusable={false}>
            <span className="inline-flex h-2 w-2 rounded-full align-middle">
              <span className={`h-2 w-2 rounded-full ${planDot.dot}`} />
            </span>
          </HoverTooltip>
          {rollup.total > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-amber-700 ring-1 ring-inset ring-amber-200">
                {rollup.pending} pending
              </span>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-blue-700 ring-1 ring-inset ring-blue-200">
                {rollup.inProgress} active
              </span>
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-emerald-700 ring-1 ring-inset ring-emerald-200">
                {rollup.deployed} deployed
              </span>
              {rollup.invalid > 0 && (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-rose-700 ring-1 ring-inset ring-rose-200">
                  {rollup.invalid} invalid
                </span>
              )}
            </span>
          )}
        </div>

        <div className="mt-3 border-t border-border-hairline pt-4 pb-6 pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pb-8">
          {plan.status === 'connecting' && (
            <p className="flex items-center gap-2 text-role-caption text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading the live plan…
            </p>
          )}
          {plan.status === 'error' && (
            <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption text-rose-700">
              Could not join the live plan{plan.error ? ` — ${plan.error}` : ''}. The file copy in
              <code className="mx-1 font-mono">master-plan.mdx</code> is still the source of truth.
            </div>
          )}
          {(plan.status === 'live' || (plan.mdx && plan.status !== 'connecting')) && (
            <MasterPlanView mdx={plan.mdx} />
          )}
        </div>
      </section>

      {/* Right rail — agent + runs; independent scroll on lg+ */}
      <div className="flex w-full flex-col gap-6 pb-8 lg:min-h-0 lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:border-border-hairline lg:pl-6">
        {showChat && (
          <div className="flex h-[min(420px,45vh)] min-h-[240px] shrink-0 flex-col">
            <PlanAgentChat />
          </div>
        )}

        {showRuns && (
          <section className="min-w-0 shrink-0">
            <p className="text-role-eyebrow uppercase tracking-[0.18em] text-text-faint">
              Run history
            </p>
            <p className="mt-1 text-role-micro text-text-faint">
              Hermes/`forge.sh` runs (`cycle_forge_runs`) — adjacent to plan tasks, not merged into them.
            </p>
            <div className="mt-3 space-y-4 border-t border-border-hairline pt-4">
              {loading && (
                <p className="flex items-center gap-2 text-role-caption text-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading runs…
                </p>
              )}
              {error && (
                <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption text-rose-700">
                  {error}
                </div>
              )}
              {!loading && !error && runs.length === 0 && (
                <p className="text-role-caption text-text-muted">
                  No runs yet. Kick one off with <code className="font-mono">forge.sh &quot;&lt;feature&gt;&quot;</code>.
                </p>
              )}
              {runs.map((run) => (
                <section key={run.id} className="rounded-lg border border-border-soft bg-surface-card p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-role-caption font-bold text-text-default">{run.feature_request}</p>
                      <p className="mt-0.5 truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
                        {run.run_uid}
                        {run.branch ? ` · ${run.branch}` : ''}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ${
                        STATUS_BADGE[run.status] ?? 'bg-surface-sunken text-text-muted'
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                  <EventTimeline
                    items={cycleForgeStepsToTimeline(run.steps)}
                    density="compact"
                    emptyMessage="No stages recorded yet."
                  />
                </section>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
