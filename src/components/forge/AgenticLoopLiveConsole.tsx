'use client';

/**
 * Agentic-loop live console — Plans Live Workbench.
 *
 * Composition (laws-driven + service-workspace ranking):
 *   Left  — ticket TOC (parent stays visible)
 *   Center — Plan Agent (SEND is the work) + centered composer; or MDX when
 *            `?view=doc`
 *   Right — live MDX HTML via {@link DetailStackRailRegistrar} (extras);
 *            run history collapsed under Advanced
 *
 * Landing: `/?mode=forge&view=live` (`live` ≡ agent-primary).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { type CycleForgeStepRow } from '@/lib/timeline/cycle-forge';
import { useMasterPlanDoc } from '@/hooks/useMasterPlanDoc';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { getForgeRunsChannelName, safeChannelName } from '@/lib/realtime/channels';
import { scanTicketStatuses, rollupTicketStatuses } from '@/lib/master-plan/ticket-status';
import { MasterPlanView } from '@/components/forge/MasterPlanView';
import { MasterPlanOutline } from '@/components/forge/MasterPlanOutline';
import { PlanAgentChat } from '@/components/forge/PlanAgentChat';
import {
  ForgePlanRail,
  ForgePlanRailReopenButton,
  type ForgeRunRow,
} from '@/components/forge/ForgePlanRail';
import {
  forgeViewParam,
  parseForgeView,
  type ForgeView,
} from '@/features/home/home-modes';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { FileText, Loader2, MessageSquare } from '@/components/Icons';
import { cn } from '@/utils/_cn';

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

const PLAN_STATUS_DOT: Record<string, { dot: string; label: string }> = {
  idle: { dot: 'bg-surface-inverse-soft', label: 'Waiting for session' },
  connecting: { dot: 'bg-amber-500', label: 'Connecting to the live plan' },
  live: { dot: 'bg-emerald-500', label: 'Live — edits merge in real time' },
  error: { dot: 'bg-rose-500', label: 'Realtime unavailable' },
};

const VIEW_ITEMS = [
  { id: 'agent', label: 'Agent', icon: MessageSquare },
  { id: 'doc', label: 'Doc', icon: FileText },
];

export function AgenticLoopLiveConsole({ showRuns = true }: { showRuns?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, has } = useAuth();
  const plan = useMasterPlanDoc();

  const forgeView = parseForgeView(searchParams.get('view'));
  const selectedTicketId = searchParams.get('ticket');

  const [runs, setRuns] = useState<ForgeRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(true);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(qs ? `/?${qs}` : '/');
    },
    [router, searchParams],
  );

  const setForgeView = useCallback(
    (next: ForgeView) => {
      setParams({ view: forgeViewParam(next) });
    },
    [setParams],
  );

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
  const runsChannel = safeChannelName(() =>
    user ? getForgeRunsChannelName(user.organizationId) : '',
  );
  const onRunChanged = useCallback(() => {
    if (!showRuns) return;
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void fetchRuns(), 300);
  }, [fetchRuns, showRuns]);
  useAblyChannel(runsChannel, 'forge_run.changed', onRunChanged, !!runsChannel && showRuns);

  const rollup = useMemo(() => rollupTicketStatuses(scanTicketStatuses(plan.mdx)), [plan.mdx]);
  const planDot = PLAN_STATUS_DOT[plan.status] ?? PLAN_STATUS_DOT.idle;
  const showChat = plan.canEdit && has('assistant.chat');
  const agentPrimary = forgeView === 'agent' && showChat;

  const runRows: ForgeRunRow[] = useMemo(
    () =>
      runs.map((r) => ({
        id: r.id,
        run_uid: r.run_uid,
        feature_request: r.feature_request,
        branch: r.branch,
        status: r.status,
        steps: r.steps,
      })),
    [runs],
  );

  if (!plan.canView) {
    return (
      <div className="rounded-xl border border-dashed border-border-default bg-surface-sunken px-4 py-6 text-center text-role-caption text-text-muted">
        You need operations.plans.view to open the live master plan.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Chrome — live status + Agent|Doc switch */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <p className="text-role-eyebrow uppercase tracking-[0.18em] text-text-faint">Plans live</p>
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
        <div className="ml-auto flex items-center gap-2">
          {!railOpen ? <ForgePlanRailReopenButton onClick={() => setRailOpen(true)} /> : null}
          {showChat ? (
            <HorizontalButtonSlider
              items={VIEW_ITEMS}
              value={forgeView}
              onChange={(id) => setForgeView(id === 'doc' ? 'doc' : 'agent')}
              variant="nav"
              dense
              className="w-auto"
              aria-label="Plans primary pane"
            />
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border-hairline bg-surface-card">
        {/* Left TOC */}
        <aside
          className={cn(
            'flex w-[min(240px,36vw)] shrink-0 flex-col border-r border-border-hairline bg-surface-card',
            'max-lg:hidden',
          )}
        >
          <p className="shrink-0 border-b border-border-hairline px-3 py-2 text-role-eyebrow uppercase tracking-[0.18em] text-text-faint">
            Tickets
          </p>
          <MasterPlanOutline
            mdx={plan.mdx}
            selectedTicketId={selectedTicketId}
            onSelect={(ticketId) => {
              setParams({ ticket: ticketId });
              setRailOpen(true);
            }}
          />
        </aside>

        {/* Center floor — one PlanAgentChat mount so Agent↔Doc keeps the thread */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
          {!agentPrimary ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {plan.status === 'connecting' && (
                <p className="flex items-center gap-2 text-role-caption text-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading the live plan…
                </p>
              )}
              {plan.status === 'error' && (
                <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption text-rose-700">
                  Could not join the live plan{plan.error ? ` — ${plan.error}` : ''}.
                </div>
              )}
              {(plan.status === 'live' || (plan.mdx && plan.status !== 'connecting')) && (
                <MasterPlanView mdx={plan.mdx} highlightTicketId={selectedTicketId} />
              )}
            </div>
          ) : null}
          {showChat ? (
            <div
              className={cn(
                'flex min-h-0 flex-col',
                agentPrimary
                  ? 'flex-1'
                  : 'max-h-[min(420px,45vh)] shrink-0 border-t border-border-hairline',
              )}
            >
              <PlanAgentChat className="min-h-0 flex-1" seedHint={selectedTicketId} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Right rail — HTML Monitor (agent-primary) or runs-focused extras (doc) */}
      <ForgePlanRail
        open={railOpen}
        onClose={() => setRailOpen(false)}
        eyebrow="Master plan"
        title={agentPrimary ? 'Live preview' : 'Runs'}
        mdx={plan.mdx}
        highlightTicketId={selectedTicketId}
        planStatus={plan.status}
        planError={plan.error}
        showRuns={showRuns}
        runs={runRows}
        runsLoading={loading}
        runsError={error}
        content={agentPrimary ? 'preview' : 'runs'}
      />
    </div>
  );
}
