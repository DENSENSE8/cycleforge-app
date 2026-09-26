'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/utils/_cn';

// ─── Stack ───────────────────────────────────────────────────────────────────

export type StackSpace = 'tight' | 'row' | 'section';

const SPACE: Record<StackSpace, string> = {
  /** gap-1.5 — chip clusters, dense sub-rows. */
  tight: 'stack-tight',
  /** gap-2 — the default row rhythm inside cards/panels. */
  row: 'stack-row',
  /** gap-6 — page/section rhythm between blocks. */
  section: 'stack-section',
};

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  /** Vertical rhythm intent. Default `row`. */
  space?: StackSpace;
}

export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  { space = 'row', className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn(SPACE[space], className)} {...rest} />;
});
