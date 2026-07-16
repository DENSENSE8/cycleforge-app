'use client';

/**
 * Walk-In station right pane — process surface for the active job.
 *
 * Sales → Square cart editor
 * Local Pickup → staged-item editor
 * Repair → identify / queue + detail (RepairTable)
 */

import { useSearchParams } from 'next/navigation';
import { LocalPickupEditPanel } from '@/components/work-orders/LocalPickupEditPanel';
import { SalesEditPanel } from '@/components/walk-in/SalesEditPanel';
import { RepairTable } from '@/components/repair';
import { useWalkInJob } from '@/hooks/useWalkInJob';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import type { RepairTab } from '@/lib/neon/repair-service-queries';

export function WalkInStationPane() {
  const { job } = useWalkInJob();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const repairTab: RepairTab =
    rawTab === 'incoming' ? 'incoming' : rawTab === 'done' ? 'done' : 'active';

  useRealtimeInvalidation({
    repair: job === 'repair',
    walkIn: job === 'sales',
    receiving: job === 'pickup',
  });

  if (job === 'sales') {
    return <SalesEditPanel />;
  }
  if (job === 'repair') {
    return <RepairTable filter={repairTab} />;
  }
  return <LocalPickupEditPanel />;
}
