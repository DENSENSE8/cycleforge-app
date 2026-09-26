'use client';

/** StepProgressHeader — the one mobile-first step-flow band: */

import type { ReactNode } from 'react';
import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';

export function StepProgressHeader({
  current,
  total,
  onClose,
  closeLabel = 'Close',
  label = 'Progress',
  leading,
  className = '',
}: {
  /** Completed steps (not the index of the step in progress). */
  current: number;
  /** Total steps — also the segment count. */
  total: number;
  /** X (top-left) — exits the flow. */
  onClose: () => void;
  closeLabel?: string;
  /** Accessible name for the progress region. */
  label?: string;
  /** Optional leading slot BEFORE the X (e.g. a guard when leaving mid-flow). */
  leading?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex h-14 shrink-0 items-center gap-3 border-b border-border-soft bg-surface-card px-3 ${className}`}
    >
      {leading}
      <IconButton
        icon={<X className="h-5 w-5" aria-hidden />}
        ariaLabel={closeLabel}
        size="md"
        onClick={onClose}
        data-testid="step-progress-close"
      />
      <ProgressBar
        current={current}
        goal={total}
        segments={total}
        label={label}
        className="min-w-0 flex-1"
      />
      <p
        className="shrink-0 text-role-caption font-semibold tabular-nums text-text-soft"
        data-testid="step-progress-count"
        aria-hidden
      >
        {current}/{total}
      </p>
    </div>
  );
}
