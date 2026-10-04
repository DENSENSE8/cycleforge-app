/**
 * Canonical mobile Outbound orders door.  Keep the route module itself as a
 * re-export of the single mobile queue root: `/m/work` is a compatibility
 * alias, never a second page assembly.
 */
import { MobileV2FulfillmentPage } from '@/components/mobile/v2/fulfillment/MobileV2FulfillmentPage';

export default function MobileOrdersPage() {
  return <MobileV2FulfillmentPage />;
}
