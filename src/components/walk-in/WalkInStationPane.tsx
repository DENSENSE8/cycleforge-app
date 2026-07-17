'use client';

/**
 * Walk-In station right pane — process surface for the active job.
 *
 * Sales → Square cart editor
 * Local Pickup → staged-item editor
 * Repair → identify / queue + detail (RepairTable)
 *
 * Realtime invalidation is scoped to the active job, so working the counter
 * doesn't subscribe the bench to every other domain's channel.
 */

import { useSearchParams } from 'next/navigation';
import { LocalPickupEditPanel } from '@/components/work-orders/LocalPickupEditPanel';
import { SalesEditPanel } from '@/components/walk-in/SalesEditPanel';
import { WalkInJobDenied } from '@/components/walk-in/WalkInJobDenied';
import { RepairTable } from '@/components/repair';
import { useWalkInJob, useWalkInJobAccess } from '@/hooks/useWalkInJob';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import type { RepairTab } from '@/lib/neon/repair-service-queries';

export function WalkInStationPane() {
  const { job } = useWalkInJob();
  const { allowed, requires } = useWalkInJobAccess(job);
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const repairTab: RepairTab =
    rawTab === 'incoming' ? 'incoming' : rawTab === 'done' ? 'done' : 'active';

  useRealtimeInvalidation({
    repair: job === 'repair' && allowed,
    walkIn: job === 'sales',
    receiving: job === 'pickup',
  });

  if (!allowed && requires) {
    return <WalkInJobDenied requires={requires} />;
  }

  if (job === 'sales') {
    return <SalesEditPanel />;
  }
  if (job === 'repair') {
    return <RepairTable filter={repairTab} />;
  }
  return <LocalPickupEditPanel />;
}
