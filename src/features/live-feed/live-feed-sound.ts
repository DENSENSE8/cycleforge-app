'use client';

/**
 * The board's optional chime (off by default, remembered per device): the
 * house "look" tone (`playScanTone('warn')`, the one AudioContext every scan
 * sound shares) when a new order lands in To pick or a package goes late —
 * worth looking up from the bench for. The first board after the page loads,
 * or after the chime is switched on, only sets the baseline.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PackageBoard } from '@/lib/live-feed/types';
import { playScanTone } from '@/lib/scan-feedback/play';

const STORAGE_KEY = 'cf.live-feed.sound';

export function useLiveFeedSound(board: PackageBoard | undefined): { on: boolean; toggle: () => void } {
  const [on, setOn] = useState(false);
  const last = useRef<{ toPick: number; late: number } | null>(null);

  useEffect(() => {
    setOn(window.localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  const toggle = useCallback(() => {
    setOn((was) => {
      const next = !was;
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      // The click is the gesture browsers need before audio plays — and it lets the operator hear the chime.
      if (next) playScanTone('warn');
      last.current = null;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!board) return;
    // What the chime watches: To pick's count (a new order) and the late total.
    const pulse = {
      toPick: board.columns.find((column) => column.stage === 'to_pick')?.count ?? 0,
      late: board.columns.reduce((sum, column) => sum + column.lateCount, 0),
    };
    const before = last.current;
    last.current = pulse;
    if (on && before != null && (pulse.toPick > before.toPick || pulse.late > before.late)) playScanTone('warn');
  }, [board, on]);

  return { on, toggle };
}
