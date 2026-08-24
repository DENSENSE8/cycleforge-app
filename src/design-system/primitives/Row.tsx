'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/utils/_cn';

// ─── Row ─────────────────────────────────────────────────────────────────────
//
// Horizontal grouping by INTENT (spacing-token-leakage plan Phase 3): an
// items-center flex row whose gap comes from the Tier-2 spacing intents
// (`row-gap`/`row-tight` — tailwind.config.mjs plugin), density-aware for
// free. Reach for <Row> instead of hand-rolling `flex items-center gap-2`.
//
// Pure layout — no surface or padding. This is the inline sibling of <Stack>;
// it is NOT the one-row list anatomy (title → meta → chips), which stays with
// the list-row primitives.

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
