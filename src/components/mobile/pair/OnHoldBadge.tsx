'use client';

import { LifecycleStateCode } from '@/components/mobile/triage/StateCode';

/**
 * Marks an unreconciled placeholder product.
 *
 * One component rather than the markup repeated per surface: this mark is the
 * only thing distinguishing stock that is real-but-unsellable from ordinary
 * inventory, so the day its wording or tone changes it must change everywhere
 * at once. A copy that drifts is a surface quietly telling someone they can
 * sell it.
 *
 * It is the `LIFECYCLE` on-hold state (`HLD`, warning tone), printed as the
 * triage code every row leads with — the registry owns the word and colour.
 */
export function OnHoldBadge() {
  return <LifecycleStateCode state="onHold" />;
}
