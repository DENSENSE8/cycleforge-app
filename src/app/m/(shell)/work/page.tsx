'use client';

/**
 * Orders list — `/m/work`, the compatibility alias of `/m/orders`. The queue
 * root ({@link MobileV2FulfillmentPage}) uses the shared triage
 * region, so both doors resolve the same mode.
 */

import { MobileV2FulfillmentPage } from '@/components/mobile/v2/fulfillment/MobileV2FulfillmentPage';

export default function MobileAssignedOrdersPage() {
  return <MobileV2FulfillmentPage />;
}
