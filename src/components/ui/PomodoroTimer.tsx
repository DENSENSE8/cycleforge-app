'use client';

/**
 * The focus timer, two disclosure levels (owner 2026-10-03: "Start focus should be identified just as a
 * timer … under a different progressive disclosure display with a full timer display. Think Apple timers."):
 *
 * - L1 — `PomodoroTimerFace`: nothing while idle on a record (the record's ⋯ menu opens the timer),
 *   or the running countdown capsule; `PomodoroTimer` (checklist sheet) shows a glyph while idle.
 * - L2 — `PomodoroTimerSheet`: a ring that drains, the remaining time large in its centre, the worked
 *   total under it, and two round verbs — Reset on the left, Start / Pause on the right (Apple Clock).
 *
 * Server state anchors every face (`usePomodoro`); the clock only ticks locally while running.
 */

import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { IconButton } from '@/design-system/primitives/IconButton';
import { usePomodoro, type PomodoroKind } from '@/lib/pomodoro/use-pomodoro';
import type { PomodoroAction, PomodoroTimer as PomodoroTimerState } from '@/lib/pomodoro/contract';
import { cn } from '@/utils/_cn';

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;
/** Round verb, Apple-Clock proportions: an 80px disc, the word inside. */
const ROUND_VERB =
  'flex size-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full text-role-caption font-semibold transition-opacity disabled:opacity-40';

export interface PomodoroClockTarget {
  kind: PomodoroKind;
  id: number;
  /** Warehouse civil day, required for a checklist instance. */
  date?: string;
  canRun?: boolean;
}

/** One timer's live state, as its face and its sheet read it. */
export interface PomodoroClock {
  running: boolean;
  loading: boolean;
  error: Error | null;
  pending: boolean;
  action: (action: PomodoroAction) => void;
  canRun: boolean;
  /** Seconds in one focus cycle. */
  cycle: number;
  remaining: number;
  /** Worked seconds on this record. */
  spent: number;
  /** Fraction of the cycle left, 0–1 (the ring). */
  left: number;
  /** A timer running on ANOTHER record, which starting this one pauses. */
  activeElsewhere: PomodoroTimerState | null;
}

/** Reads one timer for its face and its sheet (react-query dedupes the read). */
export function usePomodoroClock({ kind, id, date, canRun = true }: PomodoroClockTarget): PomodoroClock {
  const { data, loading, error, action, pending } = usePomodoro(kind, id, date);
  const [now, setNow] = useState(() => Date.now());
  const running = Boolean(data?.timer?.running);
  useEffect(() => {
    if (!running) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [running]);

  const timer = data?.timer;
  // The server snapshot already contains elapsed work through serverNow. Advance
  // only while running; a local wall clock offset cannot change persisted totals.
  const sinceRead = running && data ? Math.max(0, Math.floor((now - data.receivedAtMs) / 1000)) : 0;
  const cycle = timer?.cycleSeconds ?? 1500;
  const remaining = Math.max(0, (timer?.remainingSeconds ?? cycle) - sinceRead);
  const activeElsewhere =
    data?.activeTimer?.running &&
    (data.activeTimer.kind !== kind || data.activeTimer.id !== id || data.activeTimer.date !== (date ?? null))
      ? data.activeTimer
      : null;
  return {
    running,
    loading,
    error,
    pending,
    action,
    canRun,
    cycle,
    remaining,
    spent: (timer?.elapsedSeconds ?? 0) + sinceRead,
    left: cycle > 0 ? remaining / cycle : 0,
    activeElsewhere,
  };
}

/** L1: the running countdown capsule (null while idle). */
export function PomodoroTimerFace({ clock: c, onOpen, className }: { clock: PomodoroClock; onOpen: () => void; className?: string }) {
  if (!c.running) return null;
  return (
    // ds-raw-button: the running countdown IS the timer's face; IconButton cannot carry text.
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Focus timer, ${clock(c.remaining)} left`}
      data-testid="pomodoro-timer"
      data-disclosure-slot="timer"
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-fill-info/15 px-3 font-mono text-role-caption font-semibold tabular-nums text-text-info',
        className,
      )}
    >
      <Timer aria-hidden className="size-4" />
      {clock(c.remaining)}
    </button>
  );
}

/** L2: the full timer. */
export function PomodoroTimerSheet({
  clock: c,
  open,
  onOpenChange,
}: {
  clock: PomodoroClock;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const canStart = !c.pending && (c.canRun || c.running);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" aria-describedby={undefined} data-testid="pomodoro-timer-sheet">
        <SheetHeader className="shrink-0 px-mode-page py-3 pr-12">
          <SheetTitle>Focus Timer</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col items-center gap-6 pb-6">
          <div className="relative aspect-square w-full max-w-72" role="timer" aria-label={`${clock(c.remaining)} left`}>
            <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={RING_R} fill="none" strokeWidth="3" className="stroke-current text-border-hairline" />
              <circle
                cx="50"
                cy="50"
                r={RING_R}
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - c.left)}
                className="stroke-current text-text-info transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              <span className="font-mono text-role-display font-light tabular-nums text-text-default">{clock(c.remaining)}</span>
              <span className="text-role-caption tabular-nums text-text-muted">{clock(c.spent)} spent</span>
            </div>
          </div>

          <div className="flex w-full max-w-72 items-center justify-between">
            <button
              type="button"
              onClick={() => c.action('reset_cycle')}
              disabled={c.pending || !c.canRun || c.remaining === c.cycle}
              className={cn(ROUND_VERB, 'bg-surface-sunken text-text-default')}
            >
              <RotateCcw aria-hidden className="size-5" />
              Reset
            </button>
            <button
              type="button"
              onClick={() => c.action(c.running ? 'pause' : 'start')}
              disabled={!canStart || c.loading}
              className={cn(ROUND_VERB, c.running ? 'bg-fill-warning/15 text-text-warning' : 'bg-fill-success/15 text-text-success')}
              data-testid="pomodoro-start-pause"
            >
              {c.running ? <Pause aria-hidden className="size-5" /> : <Play aria-hidden className="size-5" />}
              {c.running ? 'Pause' : 'Start'}
            </button>
          </div>

          {c.loading ? <p className="text-role-caption text-text-muted">Loading timer…</p> : null}
          {c.error ? (
            <p role="alert" className="text-role-caption text-text-danger">
              {c.error.message}
            </p>
          ) : null}
          {c.activeElsewhere && !c.running ? (
            <p className="text-center text-role-caption text-text-muted">
              Starting here pauses your {c.activeElsewhere.kind === 'task' ? 'task' : 'check'} {c.activeElsewhere.id} timer.
            </p>
          ) : null}
          {!c.canRun && !c.error ? (
            <p className="text-center text-role-caption text-text-muted">Finished work cannot start a new focus session.</p>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** Glyph (or running capsule) + sheet, for surfaces without a ⋯ menu (the checklist item sheet). */
export function PomodoroTimer({ className, ...target }: PomodoroClockTarget & { className?: string }) {
  const c = usePomodoroClock(target);
  const [open, setOpen] = useState(false);
  return (
    <>
      {c.running ? (
        <PomodoroTimerFace clock={c} onOpen={() => setOpen(true)} className={className} />
      ) : (
        <IconButton
          onClick={() => setOpen(true)}
          ariaLabel="Focus timer"
          size="touch"
          icon={<Timer aria-hidden className="h-5 w-5" />}
          className={cn('shrink-0', className)}
          data-testid="pomodoro-timer"
        />
      )}
      <PomodoroTimerSheet clock={c} open={open} onOpenChange={setOpen} />
    </>
  );
}
