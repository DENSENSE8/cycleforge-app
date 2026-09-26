'use client';

import { LifecycleStateCode } from '@/components/mobile/triage/StateCode';

/** Marks an unreconciled placeholder product. */
export function OnHoldBadge() {
  return <LifecycleStateCode state="onHold" />;
}
