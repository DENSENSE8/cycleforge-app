'use client';

/**
 * Orders list — `/m/work`.
 *
 * In-warehouse to-ship queue with All / Assigned / Unassigned tabs.
 */

import RedesignedMobileAssignedOrders from '@/components/mobile/redesign/AssignedOrders';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

export default function MobileAssignedOrdersPage() {
  return (
    <ModeRegion mode="industrial" className="contents">
      <RedesignedMobileAssignedOrders />
    </ModeRegion>
  );
}
