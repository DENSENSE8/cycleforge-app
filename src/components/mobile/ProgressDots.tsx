'use client';

/** ProgressDots — compact progress indicator for multi-step mobile flows. */

import { useMemo } from 'react';

interface ProgressDotsProps {
  /** Number of completed steps (0-indexed value of the current step). */
  done: number;
  /** Total number of steps. */
  total: number;
  /** Maximum dots to render before collapsing to ellipsis. Default 7. */
  maxVisible?: number;
  /** Optional aria label override. */
  ariaLabel?: string;
  className?: string;
}

type DotState = 'done' | 'current' | 'pending' | 'ellipsis';

/** The rail algorithm, exported as the contract seam: */
export function buildDotRail(done: number, total: number, maxVisible: number): DotState[] {
  const clampedDone = Math.max(0, Math.min(done, total));
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) =>
      i < clampedDone ? 'done' : i === clampedDone ? 'current' : 'pending',
    );
  }
  // Long rail — show first 2 + ellipsis + last 2, sliding around current.
  // Keep current visible when possible.
  const head = 2;
  const tail = 2;
  const rail: DotState[] = [];
  for (let i = 0; i < head; i++) rail.push(i < clampedDone ? 'done' : i === clampedDone ? 'current' : 'pending');
  rail.push('ellipsis');
  for (let i = total - tail; i < total; i++) {
    rail.push(i < clampedDone ? 'done' : i === clampedDone ? 'current' : 'pending');
  }
  return rail;
}

export function ProgressDots({
  done,
  total,
  maxVisible = 7,
  ariaLabel,
  className = '',
}: ProgressDotsProps) {
  const rail = useMemo(() => buildDotRail(done, total, maxVisible), [done, total, maxVisible]);
  const safeTotal = Math.max(1, total);
  const safeDone = Math.max(0, Math.min(done, safeTotal));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-valuenow={safeDone}
      aria-label={ariaLabel ?? `Step ${safeDone + 1} of ${safeTotal}`}
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      {rail.map((state, i) => {
        if (state === 'ellipsis') {
          return (
            <span key={`gap-${i}`} aria-hidden="true" className="text-text-faint text-xs leading-none">
              ···
            </span>
          );
        }
        const base = 'inline-block rounded-full transition-colors';
        // Solid fill family (config: "progress bars, saturated indicators") —
        // never raw palette steps, never the status-pill surface washes, which
        // vanish at 8px.
        if (state === 'done') {
          return <span key={i} aria-hidden="true" className={`${base} h-2 w-2 bg-fill-success`} />;
        }
        if (state === 'current') {
          return (
            <span
              key={i}
              aria-hidden="true"
              className={`${base} h-2.5 w-2.5 bg-fill-info ring-2 ring-border-soft`}
            />
          );
        }
        return <span key={i} aria-hidden="true" className={`${base} h-2 w-2 bg-surface-strong`} />;
      })}
    </div>
  );
}
