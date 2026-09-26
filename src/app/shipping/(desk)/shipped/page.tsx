import { ShippedWorkspace } from '@/components/outbound/workspaces/ShippedWorkspace';

/**
 * `/shipping/shipped` — the Shipped desk: shipment history + lookup.
 *
 * Third peer of the Shipping desk (To ship · Amazon Prep · Shipped). It is a
 * HISTORY surface, not a lifecycle tab on the open queue: the default paint is
 * a date window (this week), never an unbounded archive, and the primary job is
 * find-and-measure rather than act.
 *
 * The body is the industrial record ledger (`ShippedLedger`): one record per
 * PACKAGE, opened by `?shipment=<id>`. No RSC seed yet — the feed is
 * client-fetched and claiming the route in `seed-budget.json` before it streams
 * would assert a seed that does not exist. See the plan's §7 performance fences.
 */
export default function ShippingShippedPage() {
  return <ShippedWorkspace />;
}
