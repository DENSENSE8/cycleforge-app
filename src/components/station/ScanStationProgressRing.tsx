'use client';

import { motion } from '@/design-system/motion';

/** Faint track — Cursor-simple scan chrome (no fill plate behind the ring). */
const TRACK_STROKE = '#E2E8F0';
/** Progress stroke — calm slate, not goal-chip semantic hues. */
const PROGRESS_STROKE = '#94A3B8';
/** Selected face — stronger ink when checklist (or peer) display is live. */
const PROGRESS_STROKE_SELECTED = '#334155';

const DEFAULT_SIZE = 16;
const DEFAULT_STROKE = 1.5;

/**
 * Scan-station procedure progress ring — bare SVG, no numeral, no card shell.
 *
 * Not {@link GoalRing}: that chip owns daily goal pace in GlobalHeader. This
 * ring answers "how far through the current carton's scan procedure" and is
 * the face of {@link ScanStationProgressControl} on every Station bench that
 * has a derived procedure.
 */
export function ScanStationProgressRing({
  percent,
  size = DEFAULT_SIZE,
  strokeWidth = DEFAULT_STROKE,
  tone = 'idle',
  className,
}: {
  /** 0–100 procedure completion. */
  percent: number;
  size?: number;
  strokeWidth?: number;
  /** `selected` darkens the progress stroke when the checklist display is live. */
  tone?: 'idle' | 'selected';
  className?: string;
}) {
  const r = size / 2 - strokeWidth;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={className ? `relative shrink-0 ${className}` : 'relative shrink-0'}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={TRACK_STROKE}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tone === 'selected' ? PROGRESS_STROKE_SELECTED : PROGRESS_STROKE}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - clamped / 100) }}
          transition={{ type: 'spring', stiffness: 120, damping: 22, mass: 0.8 }}
        />
      </svg>
    </div>
  );
}
