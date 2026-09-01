'use client';

/**
 * Orders list — `/m/work`.
 *
 * In-warehouse to-ship queue with All / Assigned / Unassigned tabs.
 */

import RedesignedMobileAssignedOrders from '@/components/mobile/redesign/AssignedOrders';

export default function MobileAssignedOrdersPage() {
  return <RedesignedMobileAssignedOrders />;
}
