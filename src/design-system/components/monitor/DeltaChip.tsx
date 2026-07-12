'use client';

import { TrendingUp } from '@/components/Icons';
import { cn } from '@/utils/_cn';

export type DeltaChipProps = {
  /** Signed percent (e.g. +12 / -3). Zero renders the empty label. */
  delta: number;
  /**
   * When true, a *decrease* is the good direction (e.g. repair queue, exceptions).
   * Affects success/danger color only — the numeric sign stays as given.
   */
  invert?: boolean;
  /** Suffix after the percent, e.g. "vs. yesterday". */
  vsLabel?: string;
  /** When delta is 0, this copy is shown instead of a chip. */
  emptyLabel?: string;
  className?: string;
};

/**
 * Monitor delta line under a KPI hero number.
 * Uses theme functional text tokens (`text-text-success` / `text-text-danger`).
 */
export function DeltaChip({
  delta,
  invert = false,
  vsLabel = 'vs. yesterday',
  emptyLabel = 'No change vs. yesterday',
  className,
}: DeltaChipProps) {
  if (!delta) {
    return (
      <p className={cn('mt-1.5 text-eyebrow font-semibold text-text-faint', className)}>
        {emptyLabel}
      </p>
    );
  }

  const positive = invert ? delta < 0 : delta > 0;

  return (
    <p
      className={cn(
        'mt-1.5 inline-flex items-center gap-0.5 text-caption font-black tabular-nums',
        positive ? 'text-text-success' : 'text-text-danger',
        className,
      )}
    >
      <TrendingUp className={cn('h-3.5 w-3.5', delta < 0 && 'rotate-180')} />
      {delta > 0 ? '+' : ''}
      {delta}% {vsLabel}
    </p>
  );
}
