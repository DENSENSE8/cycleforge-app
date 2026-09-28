'use client';

/** Plans Live right-rail occupant — selected ticket + run history. */

import { useState } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { DeskInspectorIndexShell } from '@/components/right-rail/DeskInspectorIndexShell';
import { EventTimeline } from '@/components/ui/EventTimeline';
import { cycleForgeStepsToTimeline, type CycleForgeStepRow } from '@/lib/timeline/cycle-forge';
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
        <span className="text-role-eyebrow text-text-faint">
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
                  <p className="mt-0.5 truncate text-role-eyebrow font-semibold text-text-faint">
                    {run.run_uid}
                    {run.branch ? ` · ${run.branch}` : ''}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-role-micro',
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
  highlightTicketId,
  showRuns,
  runs,
  runsLoading,
  runsError,
}: {
  open: boolean;
  onClose: () => void;
  highlightTicketId?: string | null;
  showRuns: boolean;
  runs: ForgeRunRow[];
  runsLoading: boolean;
  runsError: string | null;
}) {
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
        <DeskInspectorIndexShell
          // No index above this rail — the console's own toggle opens it — so
          // it declares `standalone` and owes no Back.
          stance="standalone"
          // ONE title cell, one segment; the plan's provenance is the console
          // around the rail, not a second header line.
          title="Runs"
          ariaLabel="Live master plan"
          testId="forge-plan-rail"
          body={
            <div className="px-3 py-3">
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
          }
        />
        {showRuns ? (
          <div className="shrink-0">
            <RunHistoryAdvanced runs={runs} loading={runsLoading} error={runsError} defaultOpen />
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
