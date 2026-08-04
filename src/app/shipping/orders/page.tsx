import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { OutboundOrdersDesk } from '@/components/outbound/orders/OutboundOrdersDesk';

/**
 * `/shipping/orders` — Fulfillment To-ship desk (Pending · Tested · Packed · Shipped).
 *
 * Canonical home for the outbound orders queue. Support › Inquiries aliases
 * here with `?context=support`. Bare `/dashboard` outbound and
 * `/support?mode=orders` 308 here (see `proxy.ts`).
 */
export default function ShippingOrdersPage() {
  return (
    <>
      <SurfaceParamHygiene />
      <OutboundOrdersDesk />
    </>
  );
}
