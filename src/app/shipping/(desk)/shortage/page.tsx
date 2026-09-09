import { HydrationBoundary } from '@tanstack/react-query';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { ShortageDeskShell } from '@/components/outbound/orders/ShortageDeskShell';
import { OrdersQueueFirstPaint } from '@/components/dashboard/OrdersQueueFirstPaint';
import { seedUnshippedQueue } from '@/lib/queries/unshipped-queue-seed.server';

/**
 * `/shipping/shortage` — out-of-stock / backorder coverage desk (Pending tab).
 */
export default async function ShippingShortagePage() {
  const seed = await seedUnshippedQueue();

  return (
    <>
      <SurfaceParamHygiene />
      <HydrationBoundary state={seed.state}>
        <div className="sr-only" aria-hidden>
          <OrdersQueueFirstPaint rows={seed.rows} />
        </div>
        <ShortageDeskShell firstPaintRows={seed.rows} />
      </HydrationBoundary>
    </>
  );
}
