'use client';

/**
 * Orders list — `/m/work`, the compatibility alias of `/m/orders`. The queue
 * root ({@link RedesignedMobileAssignedOrders}) declares its own industrial
 * region, so both doors resolve the same mode.
 */

import RedesignedMobileAssignedOrders from '@/components/mobile/redesign/AssignedOrders';

export default function MobileAssignedOrdersPage() {
  return <RedesignedMobileAssignedOrders />;
}
