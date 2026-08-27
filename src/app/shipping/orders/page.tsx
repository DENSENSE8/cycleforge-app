import { HydrationBoundary } from '@tanstack/react-query';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { OutboundOrdersDeskShell } from '@/components/outbound/orders/OutboundOrdersDeskShell';
import { OrdersQueueFirstPaint } from '@/components/dashboard/OrdersQueueFirstPaint';
import { seedUnshippedQueue } from '@/lib/queries/unshipped-queue-seed.server';

/**
 * `/shipping/orders` — Fulfillment To-ship desk (Pending · Tested · Packed · Shipped).
 *
 * Canonical home for the outbound orders queue. Support › Inquiries aliases
 * here with `?context=support`. Bare `/dashboard` outbound and
 * `/support?mode=orders` 308 here (see `proxy.ts`).
 *
 * Paint order: RSC seeds the Unshipped list into a HydrationBoundary and
 * streams {@link OrdersQueueFirstPaint} as the LCP stand-in; the interactive
 * desk hydrates over the same cache key (Packer golden).
 */
export default async function ShippingOrdersPage() {
  const seed = await seedUnshippedQueue();

  return (
    <>
      <SurfaceParamHygiene />
      <HydrationBoundary state={seed.state}>
        {/*
          SSR stand-in also rendered here so the LCP element is in the RSC
          HTML even before the client shell mounts (belt-and-suspenders with
          OutboundOrdersDeskShell's absolute overlay).
        */}
        <div className="sr-only" aria-hidden>
          <OrdersQueueFirstPaint rows={seed.rows} />
        </div>
        <OutboundOrdersDeskShell firstPaintRows={seed.rows} />
      </HydrationBoundary>
    </>
  );
}
