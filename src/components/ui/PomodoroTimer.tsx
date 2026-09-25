'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { usePomodoro, type PomodoroKind } from '@/lib/pomodoro/use-pomodoro';
import { cn } from '@/utils/_cn';

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** A focus countdown and the staffer's cumulative worked time, anchored by server state. */
export function PomodoroTimer({
  kind,
  id,
  date,
  canRun = true,
  className,
}: {
  kind: PomodoroKind;
  id: number;
  /** Warehouse civil day, required for a checklist instance. */
  date?: string;
  canRun?: boolean;
  className?: string;
}) {
  const { data, loading, error, action, pending } = usePomodoro(kind, id, date);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!data?.timer?.running) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [data?.timer?.running]);

  const timer = data?.timer;
  // The server snapshot already contains elapsed work through serverNow. Advance
  // only while running; a local wall clock offset cannot change persisted totals.
  const sinceRead = timer?.running ? Math.max(0, Math.floor((now - data!.receivedAtMs) / 1000)) : 0;
  const spent = (timer?.elapsedSeconds ?? 0) + sinceRead;
  const remaining = Math.max(0, (timer?.remainingSeconds ?? timer?.cycleSeconds ?? 1500) - sinceRead);
  const activeElsewhere = data?.activeTimer?.running &&
    (data.activeTimer.kind !== kind || data.activeTimer.id !== id || data.activeTimer.date !== (date ?? null))
      ? data.activeTimer
      : null;

  return (
    <section aria-label="Pomodoro timer" data-testid="pomodoro-timer" className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-mode-rule px-4 py-2', className)}>
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span className="text-role-micro font-semibold uppercase tracking-wide text-mode-muted">Focus</span>
        <span className="font-mono text-role-body font-bold tabular-nums text-mode-ink" aria-label={`${clock(remaining)} remaining`}>{clock(remaining)}</span>
        <span className="text-role-caption text-mode-muted">Spent <span className="font-mono tabular-nums text-mode-ink">{clock(spent)}</span></span>
      </div>
      {!loading && !error ? (
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" radius="mode" variant={timer?.running ? 'secondary' : 'primary'} disabled={pending || (!canRun && !timer?.running)} onClick={() => action(timer?.running ? 'pause' : 'start')}>
            {timer?.running ? 'Pause' : 'Start focus'}
          </Button>
          {remaining === 0 ? (
            <Button type="button" size="sm" radius="mode" variant="secondary" disabled={pending || !canRun} onClick={() => action('reset_cycle')}>
              Next 25m
            </Button>
          ) : null}
        </div>
      ) : null}
      {loading ? <span className="text-role-micro text-mode-muted">Loading timer…</span> : null}
      {error ? <span role="alert" className="text-role-micro text-text-danger">{error.message}</span> : null}
      {activeElsewhere && !timer?.running ? (
        <span className="w-full text-role-micro text-mode-muted">Starting here pauses your {activeElsewhere.kind === 'task' ? 'task' : 'check'} {activeElsewhere.id} timer.</span>
      ) : null}
      {!canRun && !error ? <span className="w-full text-role-micro text-mode-muted">Finished work cannot start a new focus session.</span> : null}
    </section>
  );
}
