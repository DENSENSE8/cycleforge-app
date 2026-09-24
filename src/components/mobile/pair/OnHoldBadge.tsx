'use client';

import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * Marks an unreconciled placeholder product.
 *
 * One component rather than the class string repeated per surface: this badge
 * is the only thing distinguishing stock that is real-but-unsellable from
 * ordinary inventory, so the day its wording or tone changes it must change
 * everywhere at once. A copy that drifts is a surface quietly telling someone
 * they can sell it.
 *
 * Ink is the `warning` state tone — LIFECYCLE has no on-hold state, and the
 * tone registry is where a state's colour lives so every theme repaints it.
 */
export function OnHoldBadge() {
  return (
    <span
      className={cn(
        'shrink-0 px-1.5 text-role-micro font-semibold uppercase tracking-wider',
        STATE_TONE_CLASSES.warning.pill,
        cornerClass('chip'),
      )}
    >
      On hold
    </span>
  );
}
