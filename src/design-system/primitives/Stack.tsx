'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/utils/_cn';

// ─── Stack ───────────────────────────────────────────────────────────────────

type StackSpace = 'tight' | 'row' | 'section';

/** Values belong to the region's mode (`spacing` in packages/design-tokens/src/modes.ts) — triage / other modes shown. */
const SPACE: Record<StackSpace, string> = {
  /** 8 / 6 — chip clusters, dense sub-rows. */
  tight: 'stack-tight',
  /** 12 / 8 — the default row rhythm inside cards/panels. */
  row: 'stack-row',
  /** 32 / 24 — page/section rhythm between blocks. */
  section: 'stack-section',
};

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  /** Vertical rhythm intent. Default `row`. */
  space?: StackSpace;
}

export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  { space = 'row', className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn(SPACE[space], className)} {...rest} />;
});
