'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/utils/_cn';

// ─── Inset ───────────────────────────────────────────────────────────────────

type InsetSpace = 'card' | 'field' | 'cozy' | 'chip';

/** Values belong to the region's mode (`spacing` in packages/design-tokens/src/modes.ts) — triage / other modes shown. */
const SPACE: Record<InsetSpace, string> = {
  /** 20×16 / 16 — card bodies. */
  card: 'inset-card',
  /** 12×8 — the dominant control/box padding. */
  field: 'inset-field',
  /** 12×8 / 10×6 — compact list rows, notice lines. */
  cozy: 'inset-cozy',
  /** 8×2 / 6×2 — chip/badge anatomy. */
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
