'use client';

/**
 * Operations ▸ Plans — right pane (Workbench: list → select → detail).
 *
 * Reads `?open=<planId>` (selection SoT is the URL; the sidebar writes it) and
 * renders the plan's phases + tasks with progress. For the bridged agentic-loop
 * plan, `?view=live` deepens the pane with the CRDT Monitor + plan agent
 * (AgenticLoopLiveConsole) — a second region, not blended into the Workbench
 * list. Live refresh rides `ops_plans:changes` via the sidebar — no polling.
 */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from '@/design-system/motion';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/utils/_cn';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { Loader2, ClipboardList } from '@/components/Icons';
import type { PhaseWithTasks, TaskRow } from '@/lib/ops-plans/types';
import { AgenticLoopLiveConsole } from '@/components/forge/AgenticLoopLiveConsole';
import {
  opsPlanDetailKey,
  fetchPlanDetail,
  MASTER_PLAN_OPS_TITLE,
  PLAN_STATUS_TONE,
  TASK_STATUS_DOT,
} from '@/components/sidebar/operations/plans-shared';

function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-surface-sunken', className)}>
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${clamped}%` }} />
    </div>
  );
}

function TaskRowItem({ task }: { task: TaskRow }) {
  const dot = TASK_STATUS_DOT[task.status] ?? TASK_STATUS_DOT.open;
  const done = task.status === 'done';
  const canceled = task.status === 'canceled';
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <HoverTooltip label={dot.label} focusable={false}>
        <span className="mt-1 inline-flex">
          <span className={cn('h-2 w-2 rounded-full', dot.dot)} />
        </span>
      </HoverTooltip>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-role-caption font-semibold',
            canceled ? 'text-text-faint line-through' : done ? 'text-text-muted' : 'text-text-default',
          )}
        >
          {task.title}
        </p>
        {(task.notes || task.assigneeName || task.completedAt) && (
          <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
            {[
              task.assigneeName,
              task.completedAt ? `done ${new Date(task.completedAt).toLocaleDateString()}` : null,
              task.notes,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>
    </li>
  );
}

function PhaseSection({ phase }: { phase: PhaseWithTasks }) {
  const pct = phase.progress?.percentComplete ?? 0;
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 border-t border-border-hairline pt-3">
        <p className="text-role-eyebrow uppercase tracking-[0.18em] text-text-faint">{phase.title}</p>
        <span className="rounded bg-surface-sunken inset-chip text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
          {phase.station}
        </span>
        <ProgressBar percent={pct} className="w-24" />
        <span className="text-role-micro tabular-nums text-text-soft">{Math.round(pct)}%</span>
      </div>
      <ul className="divide-y divide-border-hairline">
        {phase.tasks.map((t) => (
          <TaskRowItem key={t.id} task={t} />
        ))}
        {phase.tasks.length === 0 && (
          <li className="py-3 text-role-caption text-text-faint">No tasks in this phase yet.</li>
        )}
      </ul>
    </section>
  );
}

function ViewToggle({
  isLive,
  onChange,
}: {
  isLive: boolean;
  onChange: (live: boolean) => void;
}) {
  return (
    <div className="inline-flex rounded-md bg-surface-sunken p-0.5 ring-1 ring-inset ring-border-soft">
      {/* ds-raw-button: segmented control */}
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          'rounded px-2 py-1 text-role-micro uppercase tracking-widest transition-colors',
          !isLive ? 'bg-surface-card text-text-default shadow-sm' : 'text-text-muted hover:text-text-default',
        )}
      >
        Progress
      </button>
      {/* ds-raw-button: segmented control (live segment) */}
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          'rounded px-2 py-1 text-role-micro uppercase tracking-widest transition-colors',
          isLive ? 'bg-surface-card text-text-default shadow-sm' : 'text-text-muted hover:text-text-default',
        )}
      >
        Live
      </button>
    </div>
  );
}

export function OperationsPlansView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('open') ?? '';
  const isLiveView = searchParams.get('view') === 'live';

  const presence = useMotionPresence(framerPresence.workbenchPane);
  const transition = useMotionTransition(framerTransition.workbenchPaneMount);

  const setLiveView = useCallback(
    (live: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('mode', 'plans');
      if (live) params.set('view', 'live');
      else params.delete('view');
      router.replace(`/operations?${params.toString()}`);
    },
    [router, searchParams],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: opsPlanDetailKey(planId),
    queryFn: () => fetchPlanDetail(planId),
    enabled: planId.length > 0,
    staleTime: 30_000,
  });

  const isMasterPlan = data?.plan.title === MASTER_PLAN_OPS_TITLE;
  const showLive = Boolean(isMasterPlan && isLiveView);
  const paneMax = showLive ? 'max-w-6xl' : 'max-w-3xl';

  // Main is overflow-hidden (ResponsiveLayout). Sibling ops views own a
  // flex-1 + overflow-y-auto body; Plans was clipping the long live MDX.
  // Live: fill height, sticky header, independent scroll for plan + right rail.
  // Progress: single scroll column (same pattern as OperationsHistoryView).
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas text-text-default',
        // Live desktop: height-bounded host so left/right scroll independently.
        // Live mobile + Progress: single column scroll (content stacks).
        showLive ? 'h-full overflow-y-auto lg:overflow-hidden' : 'h-full overflow-y-auto',
      )}
    >
      <div
        className={cn(
          'mx-auto flex w-full min-h-0 flex-1 flex-col px-4 sm:px-6',
          paneMax,
          showLive ? 'py-5 lg:overflow-hidden lg:py-6' : 'py-8 pb-16',
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {!planId ? (
            <motion.div key="empty" {...presence} transition={transition} className="pt-16 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-sunken">
                <ClipboardList className="h-6 w-6 text-text-faint" />
              </span>
              <p className="mt-4 text-role-caption font-semibold text-text-default">Select a plan from the sidebar</p>
              <p className="mx-auto mt-1 max-w-sm text-role-caption text-text-muted">
                Plans track phased work across stations. The agentic-loop master plan syncs here automatically —
                open it and switch to Live for the shared MDX and plan agent.
              </p>
            </motion.div>
          ) : isLoading ? (
            <motion.div key={`loading-${planId}`} {...presence} transition={transition}>
              <p className="flex items-center gap-2 pt-16 text-role-caption text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading plan…
              </p>
            </motion.div>
          ) : isError || !data ? (
            <motion.div key={`error-${planId}`} {...presence} transition={transition}>
              <div className="mt-16 rounded-xl border border-dashed border-rose-200 bg-rose-50 inset-empty text-center text-role-caption text-rose-700">
                {error instanceof Error ? error.message : 'Could not load this plan.'}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`plan-${data.plan.id}-${showLive ? 'live' : 'table'}`}
              {...presence}
              transition={transition}
              className={cn(
                'flex min-h-0 flex-1 flex-col',
                showLive ? 'lg:overflow-hidden' : 'space-y-5',
              )}
            >
              <header className={cn('shrink-0 space-y-3', showLive && 'pb-3')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-text-default">{data.plan.title}</h2>
                    {data.plan.description && !showLive && (
                      <p className="mt-1 text-role-caption leading-relaxed text-text-muted">{data.plan.description}</p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded inset-chip text-role-micro uppercase tracking-widest ring-1 ring-inset',
                      PLAN_STATUS_TONE[data.plan.status] ?? PLAN_STATUS_TONE.draft,
                    )}
                  >
                    {data.plan.status}
                  </span>
                </div>

                {!showLive && (
                  <div className="flex items-center gap-3">
                    <ProgressBar percent={data.plan.progress?.percentComplete ?? 0} className="flex-1" />
                    <span className="text-role-caption font-semibold tabular-nums text-text-muted">
                      {data.plan.progress ? `${data.plan.progress.doneTasks}/${data.plan.progress.totalTasks}` : '—'}
                    </span>
                  </div>
                )}

                {isMasterPlan && (
                  <div className="flex flex-wrap items-center gap-3">
                    <ViewToggle isLive={isLiveView} onChange={setLiveView} />
                    <p className="text-role-micro text-text-faint">
                      {isLiveView
                        ? 'Live MDX + plan agent (Monitor). Progress table stays on the other tab.'
                        : 'Neon progress table. Switch to Live for the shared master plan.'}
                    </p>
                  </div>
                )}
              </header>

              {showLive ? (
                <div className="flex min-h-0 flex-1 flex-col border-t border-border-hairline pt-4 lg:overflow-hidden">
                  <AgenticLoopLiveConsole showRuns />
                </div>
              ) : (
                <div className="space-y-5">
                  {data.phases.map((phase) => (
                    <PhaseSection key={phase.id} phase={phase} />
                  ))}
                  {data.phases.length === 0 && (
                    <p className="border-t border-border-hairline pt-4 text-role-caption text-text-faint">
                      No phases yet — this plan is an empty shell.
                      {isMasterPlan
                        ? ' Open Live (or save tickets in master-plan.mdx) to sync phases from the agentic loop.'
                        : ''}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
