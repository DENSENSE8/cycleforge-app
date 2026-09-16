'use client';

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
 */
export function OnHoldBadge() {
  return (
    <span
      className={cn(
        'shrink-0 bg-amber-100 px-1.5 text-role-micro font-semibold uppercase tracking-wider text-amber-800',
        cornerClass('chip'),
      )}
    >
      On hold
    </span>
  );
}
