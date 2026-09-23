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
 * The strike is the TEXT's own decoration, not a rule drawn across the row.
 * It used to be an absolutely positioned 1px span pinned at `top-1/2` of the
 * wrapper, which is only correct while the title is exactly one line: a title
 * that wraps to two got one line through the GAP between them (operator
 * 2026-09-23 — *"it's displaying a strike through within the middle … should
 * be scoped to the text, not to the row"*). `line-through` is per-line by
 * definition and stops at the last glyph, so a wrapped title strikes twice and
 * neither line runs past its own words.
 *
 * The animation survives the change: Motion interpolates
 * `textDecorationThickness` from `0px`, so the strike still grows in and out
 * ease-in-out in BOTH directions (operator ruling 2026-09-14) instead of
 * snapping. `initial={false}` so a row that arrives already done paints struck
 * instead of animating on mount, which would make a scroll look like a hundred
 * items being completed.
 *
 * NOT a flex container: `text-decoration` does not propagate into flex items,
 * so an `inline-flex` wrapper would leave the caller's title unstruck. It is
 * an `inline-block`, which both keeps the decoration on the text inside it and
 * lets `min-w-0` still let a truncating child shrink.
 *
 * `transition-colors` on the wrapper: the line inherits `currentColor`, so the
 * text and its strike mute together on ONE transition rather than two that can
 * disagree.
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
    <motion.span
      data-struck={struck ? 'true' : 'false'}
      className={cn(
        'inline-block min-w-0 max-w-full align-middle transition-colors duration-200 [text-decoration-line:line-through]',
        struck ? 'text-text-muted' : 'decoration-transparent',
      )}
      initial={false}
      animate={{ textDecorationThickness: struck ? '1px' : '0px' }}
      transition={STRIKE_TRANSITION}
    >
      {children}
    </motion.span>
  );
}
