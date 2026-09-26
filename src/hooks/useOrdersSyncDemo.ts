'use client';

/** The demo driver behind "Demo sync (sample data)". */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applySyncRunEvent,
  cancelSyncRun,
  createSyncRun,
  type SyncRunOutcomeLine,
  type SyncRunState,
} from '@/lib/orders-sync/run-steps';
import { DEMO_RUN_DETAIL_TAB, DEMO_RUN_OUTCOME, DEMO_RUN_SCRIPT } from '@/lib/orders-sync/demo-run';
import { buildSyncRunDetail, type SyncRunDetail } from '@/lib/orders-sync/run-detail';

export interface OrdersSyncDemo {
  run: SyncRunState | null;
  elapsedMs: number;
  isRunning: boolean;
  outcome: SyncRunOutcomeLine | null;
  /**
   * Sample per-row record, published only once the run settles — mid-run the
   * real hook has nothing complete to show either, and a half-filled list
   * would invite the operator to act on a moving target.
   */
  detail: SyncRunDetail | null;
  start: () => void;
  cancel: () => void;
  dismiss: () => void;
}

export function useOrdersSyncDemo(): OrdersSyncDemo {
  const [run, setRun] = useState<SyncRunState | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [outcome, setOutcome] = useState<SyncRunOutcomeLine | null>(null);

  const runRef = useRef<SyncRunState | null>(null);
  const beatRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimers = useCallback(() => {
    clearTimeout(beatRef.current ?? undefined);
    clearInterval(tickRef.current ?? undefined);
    beatRef.current = null;
    tickRef.current = null;
  }, []);

  useEffect(() => stopTimers, [stopTimers]);

  const start = useCallback(() => {
    stopTimers();
    const fresh = createSyncRun(['shipstation', 'exceptions']);
    runRef.current = fresh;
    setRun(fresh);
    setOutcome(null);
    setElapsedMs(0);
    setIsRunning(true);

    const startedAt = Date.now();
    tickRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);

    const playFrom = (index: number) => {
      if (index >= DEMO_RUN_SCRIPT.length) {
        // The script's own `done` beats already settled each lane.
        stopTimers();
        setIsRunning(false);
        setOutcome(DEMO_RUN_OUTCOME);
        return;
      }
      const beat = DEMO_RUN_SCRIPT[index];
      beatRef.current = setTimeout(() => {
        const base = runRef.current;
        if (!base) return;
        const next = applySyncRunEvent(base, beat.lane, beat.event);
        runRef.current = next;
        setRun(next);
        playFrom(index + 1);
      }, beat.after);
    };

    playFrom(0);
  }, [stopTimers]);

  const cancel = useCallback(() => {
    stopTimers();
    const base = runRef.current;
    if (base) {
      const cancelled = cancelSyncRun(base);
      runRef.current = cancelled;
      setRun(cancelled);
    }
    setIsRunning(false);
    setOutcome({ type: 'success', message: 'Sample run cancelled' });
  }, [stopTimers]);

  const dismiss = useCallback(() => {
    stopTimers();
    runRef.current = null;
    setRun(null);
    setOutcome(null);
    setIsRunning(false);
    setElapsedMs(0);
  }, [stopTimers]);

  const detail = useMemo(
    () => (run && !isRunning ? buildSyncRunDetail(DEMO_RUN_DETAIL_TAB) : null),
    [isRunning, run],
  );

  return { run, elapsedMs, isRunning, outcome, detail, start, cancel, dismiss };
}
