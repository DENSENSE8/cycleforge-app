'use client';

import { useEffect, useState } from 'react';
import { EventTimeline } from '@/components/ui/EventTimeline';
import { cycleForgeStepsToTimeline, type CycleForgeStepRow } from '@/lib/timeline/cycle-forge';

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

/**
 * /forge — Cycle Forge run history, rendered as chat-like threads: one card per
 * run (feature request + status), each with its architect→build→sync→verify
 * stage trail via the shared EventTimeline. Reads GET /api/forge/runs (same
 * derive-live pattern as the assistant edits tray). Realtime is a later slice.
 */
export default function ForgePage() {
  const [runs, setRuns] = useState<ForgeRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/forge/runs')
      .then((r) => r.json())
      .then((d: { success: boolean; runs?: ForgeRun[]; error?: string }) => {
        if (!alive) return;
        if (d.success && d.runs) setRuns(d.runs);
        else setError(d.error ?? 'Failed to load runs');
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-text-strong">Cycle Forge</h1>
        <p className="mt-1 text-sm text-text-muted">
          Multi-agent dev-loop runs — architect → build → sync → verify.
        </p>
      </header>

      {loading && <p className="text-sm text-text-muted">Loading runs…</p>}
      {error && <p className="text-sm text-rose-600">Error: {error}</p>}
      {!loading && !error && runs.length === 0 && (
        <p className="text-sm text-text-muted">
          No runs yet. Kick one off with <code>forge.sh &quot;&lt;feature&gt;&quot;</code>.
        </p>
      )}

      <div className="space-y-4">
        {runs.map((run) => (
          <section
            key={run.id}
            className="rounded-lg border border-surface-strong/40 bg-surface p-4"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-text-strong">{run.feature_request}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {run.run_uid}
                  {run.branch ? ` · ${run.branch}` : ''}
                </p>
              </div>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
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
    </div>
  );
}
