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
  /** Suffix after the percent, e.g. "vs. yesterday". Ignored when `compact`. */
  vsLabel?: string;
  /** When delta is 0, this copy is shown instead of a chip. Ignored when `compact` (renders nothing). */
  emptyLabel?: string;
  /**
   * Compact top-right KPI readout: `+20%` only — no icon, no vs-label.
   * Zero / missing change renders nothing.
   */
  compact?: boolean;
  className?: string;
};

/**
 * Monitor delta readout. Default is the full chip under a hero; `compact` is the
 * top-right `+N%` slot on {@link KpiTile}.
 * Uses theme functional text tokens (`text-text-success` / `text-text-danger`).
 */
export function DeltaChip({
  delta,
  invert = false,
  vsLabel = 'vs. yesterday',
  emptyLabel = 'No change vs. yesterday',
  compact = false,
  className,
}: DeltaChipProps) {
  if (!delta) {
    if (compact) return null;
    return (
      <p className={cn('mt-1.5 text-role-eyebrow font-semibold text-text-faint', className)}>
        {emptyLabel}
      </p>
    );
  }

  const positive = invert ? delta < 0 : delta > 0;
  const signed = `${delta > 0 ? '+' : ''}${delta}%`;

  if (compact) {
    return (
      <span
        className={cn(
          'shrink-0 text-role-eyebrow font-semibold tabular-nums',
          positive ? 'text-text-success' : 'text-text-danger',
          className,
        )}
      >
        {signed}
      </span>
    );
  }

  return (
    <p
      className={cn(
        'mt-1.5 inline-flex items-center gap-0.5 text-role-caption font-semibold tabular-nums',
        positive ? 'text-text-success' : 'text-text-danger',
        className,
      )}
    >
      <TrendingUp className={cn('h-3.5 w-3.5', delta < 0 && 'rotate-180')} />
      {signed} {vsLabel}
    </p>
  );
}
