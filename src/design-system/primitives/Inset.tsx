'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/utils/_cn';

// ─── Inset ───────────────────────────────────────────────────────────────────

type InsetSpace = 'card' | 'field' | 'cozy' | 'chip';

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

interface InsetProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding intent. Default `card`. */
  space?: InsetSpace;
}

export const Inset = forwardRef<HTMLDivElement, InsetProps>(function Inset(
  { space = 'card', className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn(SPACE[space], className)} {...rest} />;
});
