'use client';

/** /warehouse/replenishment — pick-face restock task queue. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { replenishmentStatusBadgeClass } from '@/lib/replenishment-status';
import { Panel, Button } from '@/design-system/primitives';
import { PHONE_CARD_COLUMN, PHONE_CARD_FACE } from '@/design-system/tokens/phone-card';

interface TaskRow {
  id: number;
  sku: string;
  fromBinId: number | null;
  toBinId: number;
  qty: number;
  status: 'REQUESTED' | 'IN_PROGRESS' | 'COMPLETE' | 'CANCELED';
  detectedAt: string;
  assignedStaffId: number | null;
  qtyMoved: number | null;
}

export default function ReplenishmentPage() {
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<number | null>(null);

  const fetchTasks = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/replenishment/tasks', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTasks(data.tasks);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'load failed';
      setError(message);
    }
  }, []);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const claim = async (taskId: number) => {
    setWorking(taskId);
    try {
      const res = await fetch(`/api/replenishment/tasks/${taskId}/claim`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'claim failed');
    } finally {
      setWorking(null);
    }
  };

  const complete = async (taskId: number, defaultQty: number) => {
    const input = window.prompt(`How many units did you move?`, String(defaultQty));
    if (input == null) return;
    const qty = Number(input);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Invalid quantity');
      return;
    }
    setWorking(taskId);
    try {
      const res = await fetch(`/api/replenishment/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty_moved: qty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'complete failed');
    } finally {
      setWorking(null);
    }
  };

  const cancel = async (taskId: number) => {
    const reason = window.prompt('Cancel reason?');
    if (!reason || !reason.trim()) return;
    setWorking(taskId);
    try {
      const res = await fetch(`/api/replenishment/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'cancel failed');
    } finally {
      setWorking(null);
    }
  };

  const requested = useMemo(() => tasks?.filter((t) => t.status === 'REQUESTED') ?? [], [tasks]);
  const inProgress = useMemo(() => tasks?.filter((t) => t.status === 'IN_PROGRESS') ?? [], [tasks]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-text-soft">Warehouse</p>
          <h1 className="text-2xl font-semibold text-text-default">Replenishment</h1>
          <p className="mt-1 text-sm text-text-soft">
            Move stock from reserve to pick-face bins when forward stock runs low.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={() => void fetchTasks()}>
            Refresh
          </Button>
        </div>
      </header>

      {error && (
        <div className={`${PHONE_CARD_FACE} mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800`}>
          {error}
        </div>
      )}

      {tasks == null ? (
        <LoadingRow />
      ) : tasks.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Section
            title="Awaiting claim"
            count={requested.length}
            tone="amber"
            tasks={requested}
            actionLabel="Claim"
            onAction={(t) => void claim(t.id)}
            onCancel={(t) => void cancel(t.id)}
            working={working}
          />
          <Section
            title="In progress"
            count={inProgress.length}
            tone="blue"
            tasks={inProgress}
            actionLabel="Complete…"
            onAction={(t) => void complete(t.id, t.qty)}
            onCancel={(t) => void cancel(t.id)}
            working={working}
          />
        </>
      )}
    </div>
  );
}

// ─── Section ────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  count: number;
  tone: 'amber' | 'blue';
  tasks: TaskRow[];
  actionLabel: string;
  onAction: (t: TaskRow) => void;
  onCancel: (t: TaskRow) => void;
  working: number | null;
}

function Section({ title, count, tone, tasks, actionLabel, onAction, onCancel, working }: SectionProps) {
  const dotTone = tone === 'amber' ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <Panel radius="2xl" padding="none" className="mb-6">
      <header className="flex items-center gap-2 border-b border-border-hairline px-5 py-3">
        <span className={`h-2 w-2 rounded-full ${dotTone}`} aria-hidden="true" />
        <h2 className="text-sm font-semibold text-text-default">{title}</h2>
        <span className="ml-1 rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular-nums text-text-muted">
          {count}
        </span>
      </header>
      {tasks.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-text-soft">No tasks.</p>
      ) : (
        <ul className="divide-y divide-border-hairline">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-text-default">{t.sku}</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${replenishmentStatusBadgeClass(t.status)}`}
                  >
                    {t.status.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-text-soft">
                    {new Date(t.detectedAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
                  <span>
                    <span className="text-text-faint">From bin</span>{' '}
                    <span className="font-mono font-semibold">{t.fromBinId ?? '—'}</span>
                  </span>
                  <span aria-hidden="true" className="text-text-faint">→</span>
                  <span>
                    <span className="text-text-faint">To bin</span>{' '}
                    <span className="font-mono font-semibold">{t.toBinId}</span>
                  </span>
                  <span>
                    <span className="text-text-faint">Qty</span>{' '}
                    <span className="font-semibold tabular-nums">{t.qty}</span>
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="brand"
                  disabled={working === t.id}
                  onClick={() => onAction(t)}
                  className="rounded-2xl"
                >
                  {working === t.id ? 'Working…' : actionLabel}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={working === t.id}
                  onClick={() => onCancel(t)}
                  className="rounded-2xl"
                >
                  Cancel
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function EmptyState() {
  return (
    <div className={`${PHONE_CARD_FACE} grid place-items-center border border-emerald-200 bg-emerald-50 px-6 py-12 text-center`}>
      <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-600 text-white">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="mt-3 text-base font-semibold text-emerald-900">All pick faces stocked</p>
      <p className="mt-1 text-sm text-emerald-800/80">
        The detector will create new tasks when forward bins drop below their minimum.
      </p>
    </div>
  );
}

function LoadingRow() {
  return (
    <Panel radius="2xl" padding="lg" className={`${PHONE_CARD_COLUMN} text-center text-sm text-text-soft`}>
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 align-middle" />
      <span className="ml-2 align-middle">Loading tasks…</span>
    </Panel>
  );
}
