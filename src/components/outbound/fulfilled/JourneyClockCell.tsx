'use client';

/**
 * The JOURNEY CLOCK, painted (operator 2026-10-05): time in the order's
 * current bucket against that bucket's threshold — `3d / 1d` — toned calm ·
 * near · over (`journeyClockFace`). ONE face for the board card (led by the
 * status word: `Late · 3d / 1d`) and the sheet's Clock column (the Status
 * column already says the word). Every clock on the page ticks off one shared
 * minute ({@link useJourneyNow}), so hundreds of cells keep one timer.
 */

import { useSyncExternalStore } from 'react';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { GridCellDash } from '@/components/ui/grid-cells';
import { journeyClockFace, journeyClockSpanText, type JourneyClock, type JourneyClockTone } from '@/lib/nav/fulfilled/journey-clock';
import { cn } from '@/utils/_cn';

const TICK_MS = 60_000;

let now: number | null = null;
let timer: number | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * The viewer's now, re-read every minute while any clock is mounted. `null`
 * on the server and through hydration, so the server's HTML and the first
 * client paint agree; clocks paint once mounted.
 */
export function useJourneyNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  );
}

/** Calm reads quiet, near warns, over is the danger ink; no threshold keeps the muted age. */
export const JOURNEY_CLOCK_TONE_CLASS: Readonly<Record<JourneyClockTone, string>> = {
  calm: STATE_TONE_CLASSES.neutral.text,
  near: STATE_TONE_CLASSES.warning.text,
  over: STATE_TONE_CLASSES.danger.text,
  none: 'text-text-muted',
};

export function JourneyClockCell({
  clock,
  status,
  className,
}: {
  clock: JourneyClock | null | undefined;
  /** The bucket's word, leading the clock on a card (`Late · 3d / 1d`); omitted where a Status column says it. */
  status?: string;
  className?: string;
}) {
  const at = useJourneyNow();
  const face = at == null ? null : journeyClockFace(clock, at);
  const span = journeyClockSpanText(face);
  if (!span && !status) return <GridCellDash />;
  const tone = face?.tone ?? 'none';
  return (
    <span
      data-journey-clock={face ? tone : undefined}
      className={cn('flex min-w-0 items-baseline gap-1 tabular-nums', className)}
    >
      {status ? <span className="min-w-0 truncate font-medium text-text-default">{status}</span> : null}
      {status && span ? (
        <span aria-hidden className="shrink-0 text-text-faint">
          ·
        </span>
      ) : null}
      {span ? (
        <span className={cn('shrink-0', tone === 'over' && 'font-semibold', JOURNEY_CLOCK_TONE_CLASS[tone])}>{span}</span>
      ) : null}
    </span>
  );
}
