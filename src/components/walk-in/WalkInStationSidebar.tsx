'use client';

/**
 * Walk-In station sidebar — job rail + job-specific list/cart chrome.
 * Local Pickup graduated to Receiving `/pickup`; the pickup job shows a
 * redirect affordance only.
 */

import { useRouter } from 'next/navigation';
import { ShoppingCart } from '@/components/Icons';
import { Button, EmptyState } from '@/design-system/primitives';
import { SalesCartSidebar } from '@/components/walk-in/SalesCartSidebar';
import { WalkInJobDenied } from '@/components/walk-in/WalkInJobDenied';
import { RepairSidebarPanel } from '@/components/sidebar/RepairSidebarPanel';
import { WalkInJobSwitcher } from '@/components/walk-in/WalkInJobSwitcher';
import { useWalkInJob, useWalkInJobAccess } from '@/hooks/useWalkInJob';

export function WalkInStationSidebar() {
  const { job, setJob } = useWalkInJob();
  const { allowed, requires } = useWalkInJobAccess(job);
  const router = useRouter();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WalkInJobSwitcher job={job} onChange={setJob} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {!allowed && requires ? (
          <WalkInJobDenied requires={requires} />
        ) : job === 'sales' ? (
          <SalesCartSidebar />
        ) : job === 'repair' ? (
          <RepairSidebarPanel embedded hideSectionHeader />
        ) : (
          <div className="flex h-full items-center justify-center p-4">
            <EmptyState
              icon={<ShoppingCart className="h-6 w-6 text-text-faint" />}
              title="Use Receiving"
              description="Local Pickup is a Receiving mode."
              action={
                <Button variant="secondary" size="sm" onClick={() => router.push('/pickup')}>
                  Open /pickup
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
