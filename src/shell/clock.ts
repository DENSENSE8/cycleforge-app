'use client';

/**
 * The shell's two clocks, as a module-level store rather than shell state.
 *
 * Both tick once a second. Held in `useShell` they would re-render the whole
 * frame — every tile body, both rails — sixty times a minute for two readouts
 * that live in the header and one tool panel. `useSyncExternalStore` keeps the
 * re-render to the components that actually print a digit.
 *
 * Nothing here schedules a geometry change: the prototype's motion policy says
 * no `setTimeout` may hide a thing and no `rAF` may ease a size, and a counter
 * that only changes text obeys it.
 */

import { useSyncExternalStore } from 'react';

export interface ClockSnapshot {
  /** Session elapsed, seconds. Auto-started when the session opened. */
  readonly elapsed: number;
  readonly elapsedRunning: boolean;
  /** Lap timing, seconds. */
  readonly stopwatch: number;
  readonly stopwatchRunning: boolean;
}

/** The prototype opens mid-session at 263s with the session clock running. */
let snapshot: ClockSnapshot = {
  elapsed: 263,
  elapsedRunning: true,
  stopwatch: 0,
  stopwatchRunning: false,
};

const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;

function commit(next: ClockSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function ensureTicking(): void {
  if (interval !== null) return;
  interval = setInterval(() => {
    if (!snapshot.elapsedRunning && !snapshot.stopwatchRunning) return;
    commit({
      ...snapshot,
      elapsed: snapshot.elapsedRunning ? snapshot.elapsed + 1 : snapshot.elapsed,
      stopwatch: snapshot.stopwatchRunning ? snapshot.stopwatch + 1 : snapshot.stopwatch,
    });
  }, 1000);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensureTicking();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  };
}

/** SSR renders the frozen opening value; the interval only exists on a client. */
function getServerSnapshot(): ClockSnapshot {
  return snapshot;
}

export function useClock(): ClockSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, getServerSnapshot);
}

export function toggleElapsed(): void {
  commit({ ...snapshot, elapsedRunning: !snapshot.elapsedRunning });
}

export function resetElapsed(): void {
  commit({ ...snapshot, elapsed: 0 });
}

export function toggleStopwatch(): void {
  commit({ ...snapshot, stopwatchRunning: !snapshot.stopwatchRunning });
}

export function resetStopwatch(): void {
  commit({ ...snapshot, stopwatch: 0 });
}

/** `mm:ss`, tabular by construction. */
export function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

/** `hh:mm:ss` — the timer panel's readout. */
export function hhmmss(seconds: number): string {
  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0');
  return `${h}:${mmss(seconds % 3600)}`;
}
