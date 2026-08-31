'use client';

import { cn } from '@/utils/_cn';

/** Faint track — Cursor-simple scan chrome (no fill plate behind the ring). */
const TRACK_STROKE = '#E2E8F0';
/** Progress stroke — calm slate, not goal-chip semantic hues. */
const PROGRESS_STROKE = '#94A3B8';
/** Selected face — stronger ink when checklist (or peer) display is live. */
const PROGRESS_STROKE_SELECTED = '#334155';

/**
 * Scan-station procedure progress ring — the same SVG face as house icons
 * (`viewBox="0 0 24 24"`, sized by `className`, no wrapping pixel box).
 *
 * A sized `<div>` + a rotated inner SVG sits on a different alignment than
 * `PackageOpen` (`<svg className="h-3.5 w-3.5">`), which is why the composer
 * ring used to float above Unbox even when both claimed `items-center`.
 *
 * Not {@link GoalRing}: that chip owns daily goal pace in GlobalHeader.
 */
export function ScanStationProgressRing({
  percent,
  tone = 'idle',
  className,
}: {
  /** 0–100 procedure completion. */
  percent: number;
  /** `selected` darkens the progress stroke when the checklist display is live. */
  tone?: 'idle' | 'selected';
  className?: string;
}) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <svg
      className={cn('block shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r={r}
        stroke={TRACK_STROKE}
        strokeWidth={2}
      />
      <circle
        cx="12"
        cy="12"
        r={r}
        stroke={tone === 'selected' ? PROGRESS_STROKE_SELECTED : PROGRESS_STROKE}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped / 100)}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}
