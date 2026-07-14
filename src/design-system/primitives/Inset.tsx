'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/utils/_cn';

// ─── Inset ───────────────────────────────────────────────────────────────────
//
// Padding by INTENT (spacing-token-leakage plan Phase 3): a plain padded box
// whose inset comes from the Tier-2 spacing intents (`inset-card/field/cozy/
// chip` — tailwind.config.ts plugin), so it is density-aware for free. Reach
// for <Inset> instead of hand-picking another `px-N py-M` pair for the same
// job (the census found 65 distinct paddings on one box archetype).
//
// Padding ONLY — no surface, border, or radius (that's <Panel>). The intent
// is the whole padding story for this element: don't add raw p-*/px-* via
// className. `inset-empty` is deliberately absent — the dashed empty/error
// recipe belongs to <EmptyState>.

export type InsetSpace = 'card' | 'field' | 'cozy' | 'chip';

const SPACE: Record<InsetSpace, string> = {
  /** p-4 — card bodies. */
  card: 'inset-card',
  /** px-3 py-2 — the dominant control/box padding. */
  field: 'inset-field',
  /** px-2.5 py-1.5 — compact list rows, notice lines. */
  cozy: 'inset-cozy',
  /** px-1.5 py-0.5 — chip/badge anatomy. */
  chip: 'inset-chip',
};

export interface InsetProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding intent. Default `card`. */
  space?: InsetSpace;
}

export const Inset = forwardRef<HTMLDivElement, InsetProps>(function Inset(
  { space = 'card', className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn(SPACE[space], className)} {...rest} />;
});
