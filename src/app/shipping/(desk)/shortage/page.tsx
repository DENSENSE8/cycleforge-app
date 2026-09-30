import { redirect } from 'next/navigation';
import { HydrationBoundary } from '@tanstack/react-query';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { ShortageDeskShell } from '@/components/outbound/orders/ShortageDeskShell';
import { OrdersQueueFirstPaint } from '@/components/dashboard/OrdersQueueFirstPaint';
import { seedUnshippedQueue } from '@/lib/queries/unshipped-queue-seed.server';
import { shortageDeskRedirectSearch } from '@/lib/orders/desk-view-filters';
import { SHIPPING_SHORTAGE_PATH } from '@/lib/shipping/orders-desk';

/**
 * `/shipping/shortage` — the PO-paired out-of-stock desk. PARKED (owner
 * 2026-09-29): not an FBM view and linked from nowhere, kept reachable by URL
 * for the PO pairing build. Out-of-stock orders live on Allocate's Stock
 * filter (`?ustatus=BLOCKED`).
 */
export default async function ShippingShortagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const redirectSearch = shortageDeskRedirectSearch(await searchParams);
  if (redirectSearch != null) redirect(`${SHIPPING_SHORTAGE_PATH}?${redirectSearch}`);

  const seed = await seedUnshippedQueue({ blockedOnly: true, pair: 'po' });

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
