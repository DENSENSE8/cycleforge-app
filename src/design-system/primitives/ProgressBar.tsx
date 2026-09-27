'use client';

import { motion, useReducedMotion } from '@/design-system/motion';
import { motionBezier, motionDuration } from '@/design-system/foundations/motion-presets';
import { sectionLabel } from '@/design-system/tokens/typography/presets';

interface ProgressBarProps {
  current: number;
  goal: number;
  label?: string;
  showPercentage?: boolean;
  showRemaining?: boolean;
  variant?: 'default' | 'success';
  /** Segmented face (PG12): */
  segments?: number;
  className?: string;
}

export function ProgressBar({
  current,
  goal,
  label,
  showPercentage = true,
  showRemaining = true,
  variant = 'default',
  segments,
  className = '',
}: ProgressBarProps) {
  const reduceMotion = useReducedMotion();
  const percentage = Math.min((current / goal) * 100, 100);
  const remaining = Math.max(0, goal - current);
  const isComplete = current >= goal;
  const barColor = variant === 'success' || isComplete ? 'bg-emerald-500' : 'bg-blue-500';

  if (segments && segments > 0) {
    return (
      <div
        className={className}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={current}
        aria-label={label ?? 'Progress'}
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
                className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken"
              >
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: fill }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: motionDuration.progressFill, ease: motionBezier.easeOut }
                  }
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
    <div className={className}>
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
