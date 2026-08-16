/**
 * SSR skeleton for the Unbox **middle** work plane.
 *
 * Paint order on cold `/unbox` (ruled 2026-08-12, operator call):
 *   1. the SELECTED recents-rail row — the carton you were last on, already
 *      marked selected, seeded server-side so it is in the first HTML;
 *   2. this middle skeleton;
 *   3. the right edge;
 *   4. the rest of the rail.
 *
 * It deliberately paints NO carton data. The previous version rendered the MRU
 * carton's identity + line titles as an LCP stand-in, and at the bench that read
 * as a broken, half-rendered station: a lone "Return carton" heading with a
 * tracking number and nothing operable, held on screen until the real workspace
 * hydrated behind it. A skeleton says "this is loading"; a partial carton says
 * "this is your carton" and is wrong about it.
 *
 * Static geometry only — no `animate-pulse`. The bars mark where the identity
 * band and line rows will land so the swap costs no layout shift (CLS 0); a
 * pulsing skeleton on a scan floor reads as a fault light.
 *
 * Server-safe — no `'use client'`, no motion, no TanStack.
 */

import { cn } from '@/utils/_cn';

/** Row count is the visual weight of a typical carton, not a data claim. */
const SKELETON_LINE_ROWS = 6;

export function UnboxStationFirstPaint({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-canvas',
        className,
      )}
      aria-busy="true"
      aria-label="Loading carton"
      data-paint-surface="unbox:primary"
      data-testid="unbox-station-first-paint"
    >
      {/* Identity band placeholder — matches the real carton context row height. */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border-hairline px-4">
        <div className="h-3 w-24 shrink-0 rounded-none bg-surface-sunken" />
        <div className="h-3 w-64 max-w-[40%] rounded-none bg-surface-sunken" />
        <div className="ml-auto h-3 w-20 shrink-0 rounded-none bg-surface-sunken" />
      </div>

      {/* Line rows placeholder — the middle work plane. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
        {Array.from({ length: SKELETON_LINE_ROWS }, (_, i) => (
          <div
            key={i}
            className="flex h-11 shrink-0 items-center gap-3 border-b border-border-hairline"
          >
            <div className="h-3 flex-1 rounded-none bg-surface-sunken" />
            <div className="h-3 w-24 shrink-0 rounded-none bg-surface-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}
