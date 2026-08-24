'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/utils/_cn';

// ─── Stack ───────────────────────────────────────────────────────────────────
//
// Vertical rhythm by INTENT (spacing-token-leakage plan Phase 3): a column
// flex whose gap comes from the Tier-2 spacing intents (`stack-tight/row/
// section` — tailwind.config.mjs plugin), so it is density-aware for free.
// Reach for <Stack> instead of hand-rolling `flex flex-col gap-2`.
//
// Pure layout: no surface, border, or padding of its own — pair with <Panel>
// (surface) or <Inset> (padding) as needed.

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
