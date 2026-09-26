import { HydrationBoundary } from '@tanstack/react-query';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { OutboundOrdersDeskShell } from '@/components/outbound/orders/OutboundOrdersDeskShell';
import { OrdersQueueFirstPaint } from '@/components/dashboard/OrdersQueueFirstPaint';
import { seedUnshippedQueue } from '@/lib/queries/unshipped-queue-seed.server';
import { parseDeskQueueParam } from '@/lib/orders/desk-view-filters';
import { DESK_QUEUE_PARAM } from '@/lib/outbound/desk-views';

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
export default async function ShippingOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // `?queue=pick` (desk-sidebar Pick list) is a different row set — seed it,
  // not the Action list, so the first paint is the list the operator opened.
  const rawQueue = (await searchParams)[DESK_QUEUE_PARAM];
  const queue = parseDeskQueueParam(Array.isArray(rawQueue) ? rawQueue[0] : rawQueue) ?? undefined;
  const seed = await seedUnshippedQueue({ queue });

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
          <OrdersQueueFirstPaint rows={seed.rows} variant="ledger" />
        </div>
        <OutboundOrdersDeskShell firstPaintRows={seed.rows} />
      </HydrationBoundary>
    </>
  );
}
