'use client';

import { motion, useReducedMotion } from '@/design-system/motion';
import { motionBezier, framerDuration } from '@/design-system/foundations/motion-framer';
import { sectionLabel } from '@/design-system/tokens/typography/presets';

interface ProgressBarProps {
  current: number;
  goal: number;
  label?: string;
  showPercentage?: boolean;
  showRemaining?: boolean;
  variant?: 'default' | 'success';
  className?: string;
}

export function ProgressBar({
  current,
  goal,
  label,
  showPercentage = true,
  showRemaining = true,
  variant = 'default',
  className = '',
}: ProgressBarProps) {
  const reduceMotion = useReducedMotion();
  const percentage = Math.min((current / goal) * 100, 100);
  const remaining = Math.max(0, goal - current);
  const isComplete = current >= goal;
  const barColor = variant === 'success' || isComplete ? 'bg-emerald-500' : 'bg-blue-500';

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
        {/*
          Law M1: nothing animates layout. The fill is a `scaleX` transform, not
          a `width` tween — it composites off the main thread and reflows
          nothing, where animating width relaid out the document every frame.
          `transform-origin: left` makes the scale read as a fill from the start
          edge. `useReducedMotion` snaps to the value instead of easing to it.
        */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: percentage / 100 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: framerDuration.progressFill, ease: motionBezier.easeOut }
          }
          style={{ transformOrigin: 'left' }}
          className={`h-full w-full rounded-full ${barColor}`}
        />
      </div>
    </div>
  );
}
