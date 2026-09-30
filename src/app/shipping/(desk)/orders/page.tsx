import { HydrationBoundary } from '@tanstack/react-query';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { OutboundOrdersDeskShell } from '@/components/outbound/orders/OutboundOrdersDeskShell';
import { OrdersQueueFirstPaint } from '@/components/dashboard/OrdersQueueFirstPaint';
import { seedUnshippedQueue } from '@/lib/queries/unshipped-queue-seed.server';

/** `/shipping/orders` — FBM › Allocate, the view FBM lands on (`DESK_VIEWS` `landing`). */
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
