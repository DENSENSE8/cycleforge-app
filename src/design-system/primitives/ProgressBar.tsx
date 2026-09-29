'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from '@/design-system/motion';
import { motionBezier, motionDuration } from '@/design-system/foundations/motion-presets';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';

/** The thinnest a segment may paint (`w-1`) and the gap between two (`gap-1`); below it the bar goes continuous. */
const SEGMENT_MIN_PX = 4;
const SEGMENT_GAP_PX = 4;

interface ProgressBarProps {
  current: number;
  goal: number;
  label?: string;
  /** Accessible name only — no visible text (e.g. a wordless header bar). */
  ariaLabel?: string;
  showPercentage?: boolean;
  showRemaining?: boolean;
  variant?: 'default' | 'success';
  /**
   * Segmented face (PG12): one segment per step. When the segments would
   * paint thinner than {@link SEGMENT_MIN_PX} the bar goes continuous, with a
   * tick at {@link activeSegment}.
   */
  segments?: number;
  /** Segmented face: the step in hand — painted in ink ("you are here"). */
  activeSegment?: number;
  className?: string;
}

export function ProgressBar({
  current,
  goal,
  label,
  ariaLabel,
  showPercentage = true,
  showRemaining = true,
  variant = 'default',
  segments,
  activeSegment,
  className = '',
}: ProgressBarProps) {
  const reduceMotion = useReducedMotion();
  const percentage = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const remaining = Math.max(0, goal - current);
  const isComplete = current >= goal;
  const barColor = variant === 'success' || isComplete ? 'bg-emerald-500' : 'bg-blue-500';
  const fillTransition = reduceMotion
    ? { duration: 0 }
    : { duration: motionDuration.progressFill, ease: motionBezier.easeOut };

  // The segmented face measures its track: too many steps for the width → continuous.
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !segments) return;
    const observer = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [segments]);
  const segmentsFit =
    trackWidth == null || !segments || (trackWidth - (segments - 1) * SEGMENT_GAP_PX) / segments >= SEGMENT_MIN_PX;
  const active = activeSegment != null && segments && activeSegment >= 0 && activeSegment < segments ? activeSegment : null;

  if (segments && segments > 0 && !segmentsFit) {
    return (
      <div
        ref={trackRef}
        className={className}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={current}
        aria-label={ariaLabel ?? label ?? 'Progress'}
      >
        <div className="relative h-2 rounded-full bg-surface-sunken">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: percentage / 100 }}
            transition={fillTransition}
            style={{ transformOrigin: 'left' }}
            className={`h-full w-full rounded-full ${barColor}`}
          />
          {active != null ? (
            <span
              aria-hidden
              data-progress-tick
              className="absolute -inset-y-1 w-1 -translate-x-1/2 rounded-full bg-text-default"
              style={{ left: `${((active + 0.5) / segments) * 100}%` }}
            />
          ) : null}
        </div>
      </div>
    );
  }

  if (segments && segments > 0) {
    return (
      <div
        ref={trackRef}
        className={className}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={current}
        aria-label={ariaLabel ?? label ?? 'Progress'}
      >
        <div className="flex items-center gap-1">
          {Array.from({ length: segments }, (_, i) => {
            // Segment i covers [i, i+1) of the goal: full below `current`,
            // fractional when straddling it, empty above. The fraction feeds
            // the SAME scaleX fill as the continuous face — one motion law.
            const fill = Math.max(0, Math.min(1, current - i));
            return (
              <div
                key={i}
                data-progress-segment={i === active ? 'active' : fill >= 1 ? 'done' : 'todo'}
                className={cn('h-2 min-w-1 flex-1 overflow-hidden rounded-full', i === active ? 'bg-text-default' : 'bg-surface-sunken')}
              >
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: fill }}
                  transition={fillTransition}
                  style={{ transformOrigin: 'left' }}
                  className={`h-full w-full rounded-full ${barColor}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={current}
      aria-label={ariaLabel ?? label ?? 'Progress'}
    >
      {(showPercentage || showRemaining || label) && (
        <div className="flex items-center justify-between mb-2">
          {label && <p className={sectionLabel}>{label}</p>}
          {showPercentage && <p className={sectionLabel}>{Math.round(percentage)}%</p>}
          {showRemaining && <p className={`${sectionLabel} tabular-nums`}>{remaining} remaining</p>}
        </div>
      )}
      <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
        {/* Law M1: nothing animates layout. */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: percentage / 100 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: motionDuration.progressFill, ease: motionBezier.easeOut }
          }
          style={{ transformOrigin: 'left' }}
          className={`h-full w-full rounded-full ${barColor}`}
        />
      </div>
    </div>
  );
}
