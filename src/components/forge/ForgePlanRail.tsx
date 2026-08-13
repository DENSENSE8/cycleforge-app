'use client';

/**
 * Plans Live right-rail occupant — live MDX HTML Monitor + collapsed run history.
 * Registers on the house {@link DetailStackRailRegistrar} (push, non-modal).
 */

import { useState } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { PaneHeaderLabel } from '@/components/ui/pane-header';
import { EventTimeline } from '@/components/ui/EventTimeline';
import { cycleForgeStepsToTimeline, type CycleForgeStepRow } from '@/lib/timeline/cycle-forge';
import { MasterPlanView } from '@/components/forge/MasterPlanView';
import { Loader2, ChevronDown, ChevronUp } from '@/components/Icons';
import { Panel, Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export interface ForgeRunRow {
  id: number;
  run_uid: string;
  feature_request: string;
  branch: string | null;
  status: string;
  steps: CycleForgeStepRow[];
}

const STATUS_BADGE: Record<string, string> = {
  running: 'bg-blue-50 text-blue-700',
  passed: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-rose-50 text-rose-700',
  error: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-surface-sunken text-text-muted',
};

function RunHistoryAdvanced({
  runs,
  loading,
  error,
  defaultOpen = false,
}: {
  runs: ForgeRunRow[];
  loading: boolean;
  error: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-border-hairline">
      {/* ds-raw-button: disclosure toggle for advanced run history, not a primary action */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-sunken/50"
        aria-expanded={open}
      >
        <span className="text-role-eyebrow uppercase tracking-[0.18em] text-text-faint">
          Advanced · Run history
          {runs.length > 0 ? (
            <span className="ml-1.5 tabular-nums text-text-soft">{runs.length}</span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-text-faint" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-faint" />
        )}
      </button>
      {open ? (
        <div className="space-y-3 px-3 pb-4">
          {loading && (
            <p className="flex items-center gap-2 text-role-caption text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading runs…
            </p>
          )}
          {error && (
            <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-3 py-2 text-role-caption text-rose-700">
              {error}
            </div>
          )}
          {!loading && !error && runs.length === 0 && (
            <p className="text-role-caption text-text-muted">
              No runs yet. Kick one off with <code className="font-mono">forge.sh &quot;&lt;feature&gt;&quot;</code>.
            </p>
          )}
          {runs.map((run) => (
            <Panel radius="lg" padding="sm" key={run.id}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-role-caption font-semibold text-text-default">
                    {run.feature_request}
                  </p>
                  <p className="mt-0.5 truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
                    {run.run_uid}
                    {run.branch ? ` · ${run.branch}` : ''}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest',
                    STATUS_BADGE[run.status] ?? 'bg-surface-sunken text-text-muted',
                  )}
                >
                  {run.status}
                </span>
              </div>
              <EventTimeline
                items={cycleForgeStepsToTimeline(run.steps)}
                density="compact"
                emptyMessage="No stages recorded yet."
              />
            </Panel>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ForgePlanRail({
  open,
  onClose,
  title,
  eyebrow,
  mdx,
  highlightTicketId,
  planStatus,
  planError,
  showRuns,
  runs,
  runsLoading,
  runsError,
  /** `preview` = live MDX Monitor (agent-primary). `runs` = extras only (doc-primary). */
  content = 'preview',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow: string;
  mdx: string;
  highlightTicketId?: string | null;
  planStatus: string;
  planError?: string | null;
  showRuns: boolean;
  runs: ForgeRunRow[];
  runsLoading: boolean;
  runsError: string | null;
  content?: 'preview' | 'runs';
}) {
  const showPreview = content === 'preview';

  return (
    <DetailStackRailRegistrar
      id="detail:forge-master-plan"
      push
      onClose={onClose}
      enabled={open}
      modal={false}
      ariaLabel="Live master plan"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border-hairline bg-surface-card/90 backdrop-blur-xl">
          <DeskRailChromeRow onClose={onClose} closeTitle="Hide plan panel" />
          <div className="px-3 pb-2">
            <PaneHeaderLabel eyebrow={eyebrow} value={title} />
          </div>
        </div>
        {showPreview ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
            {planStatus === 'connecting' && (
              <p className="flex items-center gap-2 text-role-caption text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading the live plan…
              </p>
            )}
            {planStatus === 'error' && (
              <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption text-rose-700">
                Could not join the live plan{planError ? ` — ${planError}` : ''}. The file copy in
                <code className="mx-1 font-mono">master-plan.mdx</code> is still the source of truth.
              </div>
            )}
            {(planStatus === 'live' || (mdx && planStatus !== 'connecting')) && (
              <MasterPlanView mdx={mdx} highlightTicketId={highlightTicketId} />
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
            {highlightTicketId ? (
              <p className="mb-3 text-role-caption text-text-muted">
                Selected{' '}
                <span className="font-semibold text-text-default">{highlightTicketId}</span>
                {' — '}visible in the document.
              </p>
            ) : (
              <p className="mb-3 text-role-caption text-text-muted">
                Pick a ticket in the outline, or expand run history below.
              </p>
            )}
          </div>
        )}
        {showRuns ? (
          <div className="shrink-0">
            <RunHistoryAdvanced runs={runs} loading={runsLoading} error={runsError} defaultOpen={!showPreview} />
          </div>
        ) : null}
      </div>
    </DetailStackRailRegistrar>
  );
}

/** Re-open affordance when the plan rail is parked. */
export function ForgePlanRailReopenButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick}>
      Show plan
    </Button>
  );
}
