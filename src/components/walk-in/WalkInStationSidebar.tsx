'use client';

/**
 * Walk-In station sidebar — job rail + job-specific list/cart chrome.
 */

import { LocalPickupSidebarList } from '@/components/work-orders/LocalPickupSidebarList';
import { SalesCartSidebar } from '@/components/walk-in/SalesCartSidebar';
import { RepairSidebarPanel } from '@/components/sidebar/RepairSidebarPanel';
import { WalkInJobSwitcher } from '@/components/walk-in/WalkInJobSwitcher';
import { useWalkInJob } from '@/hooks/useWalkInJob';

export function WalkInStationSidebar() {
  const { job, setJob } = useWalkInJob();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <WalkInJobSwitcher job={job} onChange={setJob} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {job === 'sales' ? (
          <SalesCartSidebar />
        ) : job === 'repair' ? (
          <RepairSidebarPanel embedded hideSectionHeader />
        ) : (
          <LocalPickupSidebarList />
        )}
      </div>
    </div>
  );
}
