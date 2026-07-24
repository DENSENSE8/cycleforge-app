'use client';

/**
 * Walk-In station right pane — process surface for the active job.
 *
 * Sales → Square cart editor
 * Repair → identify / queue + detail (RepairTable)
 * Local Pickup → graduated to Receiving `/pickup` (no longer hosted here)
 */

import { useSearchParams, useRouter } from 'next/navigation';
import { ShoppingCart } from '@/components/Icons';
import { EmptyState, Button } from '@/design-system/primitives';
import { SalesEditPanel } from '@/components/walk-in/SalesEditPanel';
import { WalkInJobDenied } from '@/components/walk-in/WalkInJobDenied';
import { RepairTable } from '@/components/repair';
import { useWalkInJob, useWalkInJobAccess } from '@/hooks/useWalkInJob';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { parseRepairTab } from '@/lib/walk-in/history-modes';

export function WalkInStationPane() {
  const { job } = useWalkInJob();
  const { allowed, requires } = useWalkInJobAccess(job);
  const router = useRouter();
  const searchParams = useSearchParams();
  const repairTab = parseRepairTab(searchParams.get('tab'));

  useRealtimeInvalidation({
    repair: job === 'repair' && allowed,
    walkIn: job === 'sales',
    receiving: false,
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

  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        icon={<ShoppingCart className="h-7 w-7 text-text-faint" />}
        title="Local Pickup moved"
        description="Front-desk pickup intake lives on Receiving → Local Pickup."
        action={
          <Button variant="secondary" size="sm" onClick={() => router.push('/pickup')}>
            Open Local Pickup
          </Button>
        }
      />
    </div>
  );
}
