'use client';

import type { ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { GridStatusCellValue } from '@/components/ui/grid-cells';

export type BinStatus = 'empty' | 'low' | 'over' | 'stale' | 'ok';

interface Props {
  status: BinStatus;
  /** Show full label (default) or just the dot. */
  compact?: boolean;
}

const TONE: Record<
  BinStatus,
  { toneClass: string; dot: string; label: string }
> = {
  empty: {
    toneClass: 'bg-surface-canvas text-text-muted',
    dot: 'bg-border-emphasis',
    label: 'Empty',
  },
  low: {
    toneClass: 'bg-amber-50 text-amber-800',
    dot: 'bg-amber-500',
    label: 'Low',
  },
  over: {
    toneClass: 'bg-red-50 text-red-700',
    dot: 'bg-red-500',
    label: 'Over cap',
  },
  stale: {
    toneClass: 'bg-purple-50 text-purple-700',
    dot: 'bg-purple-500',
    label: 'Stale',
  },
  ok: {
    toneClass: 'bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
    label: 'OK',
  },
};

export function StatusChip({ status, compact }: Props) {
  const tone = TONE[status];
  if (compact) {
    return (
      <HoverTooltip label={tone.label} asChild>
        <span
          className={`inline-block h-2 w-2 rounded-full ${tone.dot}`}
          aria-label={tone.label}
        />
      </HoverTooltip>
    );
  }
  return (
    <GridStatusCellValue
      label={tone.label}
      toneClass={tone.toneClass}
      dotClass={tone.dot}
    />
  );
}

/** Render every applicable status chip given the booleans. */
export function StatusChips({
  is_empty,
  has_low_stock,
  is_over_capacity,
  is_stale,
  compact,
}: {
  is_empty: boolean;
  has_low_stock: boolean;
  is_over_capacity: boolean;
  is_stale: boolean;
  compact?: boolean;
}): ReactNode {
  const chips: BinStatus[] = [];
  if (is_empty) chips.push('empty');
  if (has_low_stock) chips.push('low');
  if (is_over_capacity) chips.push('over');
  if (is_stale) chips.push('stale');
  if (chips.length === 0) chips.push('ok');
  return (
    <span className="inline-flex min-w-0 max-w-full flex-nowrap gap-1 overflow-hidden">
      {chips.map((c) => (
        <StatusChip key={c} status={c} compact={compact} />
      ))}
    </span>
  );
}
