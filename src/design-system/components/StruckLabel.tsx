'use client';

/**
 * The STRUCK label face — text whose work is done.
 *
 * ONE strike for the whole product. It lives in the design system because BOTH
 * faces of the daily checklist need it and they cannot import each other: the
 * desk's slot table paints it from the shared compound cell (opt-in via
 * `CompoundRowView.titleStruck`), and the phone surface
 * (`/m/home`, cards + BottomSheet per SURFACE_LAW §5) paints it on a row. A
 * second copy is how the two faces would end up animating differently.
 *
 * A caller that never mounts it renders exactly as before — that is what keeps
 * this out of Orders' and Receiving's paint.
 *
 * The line is a sibling span laid across the title, animated by Motion
 * (`@/design-system/motion` — the one import site for the engine) ease-in-out
 * in BOTH directions, per operator ruling 2026-09-14. `initial={false}` so a
 * row that arrives already done paints struck instead of animating on mount,
 * which would make a scroll look like a hundred items being completed.
 *
 * `bg-current` + `transition-colors` on the wrapper: the line and the text
 * mute together on ONE transition rather than two that can disagree.
 *
 * `min-w-0` is load-bearing — without it the wrapper refuses to shrink and
 * the label inside it stops truncating.
 */

import type { ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';

/** Ease in, ease out — both directions of the strike (operator ruling). */
const STRIKE_TRANSITION = { duration: 0.28, ease: 'easeInOut' } as const;

export function StruckLabel({
  struck,
  children,
}: {
  struck: boolean;
  children: ReactNode;
}) {
  return (
    <span
      data-struck={struck ? 'true' : 'false'}
      className={cn(
        'relative inline-flex min-w-0 items-center transition-colors duration-200',
        struck && 'text-text-muted',
      )}
    >
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute left-0 top-1/2 h-px bg-current"
        initial={false}
        animate={{ width: struck ? '100%' : '0%' }}
        transition={STRIKE_TRANSITION}
      />
    </span>
  );
}
