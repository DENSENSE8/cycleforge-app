import { redirect } from 'next/navigation';
import { HydrationBoundary } from '@tanstack/react-query';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { ShortageDeskShell } from '@/components/outbound/orders/ShortageDeskShell';
import { OrdersQueueFirstPaint } from '@/components/dashboard/OrdersQueueFirstPaint';
import { seedUnshippedQueue } from '@/lib/queries/unshipped-queue-seed.server';
import { shortageDeskRedirectSearch } from '@/lib/orders/desk-view-filters';
import { SHIPPING_SHORTAGE_PATH } from '@/lib/shipping/orders-desk';

/**
 * `/shipping/shortage` — out-of-stock / backorder coverage desk (Pending tab).
 *
 * The desk sidebar has no "all pending" view: the one view here is PO paired
 * (`?pair=po`), so a bare or foreign `pair` is redirected to it, every other
 * param kept.
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
