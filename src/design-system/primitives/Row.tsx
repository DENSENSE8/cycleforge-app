'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/utils/_cn';

// ─── Row ─────────────────────────────────────────────────────────────────────

export type RowGap = 'default' | 'tight';

const GAP: Record<RowGap, string> = {
  /** gap-2 — the default inline grouping. */
  default: 'row-gap',
  /** gap-1.5 — tight icon+text or chip pairs. */
  tight: 'row-tight',
};

export interface RowProps extends HTMLAttributes<HTMLDivElement> {
  /** Horizontal gap intent. Default `default`. */
  gap?: RowGap;
}

export const Row = forwardRef<HTMLDivElement, RowProps>(function Row(
  { gap = 'default', className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn(GAP[gap], className)} {...rest} />;
});
