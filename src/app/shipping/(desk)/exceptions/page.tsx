import { Suspense } from 'react';
import { OrderExceptionsWorkbench } from '@/components/outbound/orders/exceptions/OrderExceptionsWorkbench';

/** `/shipping/exceptions` — the held-order queue. */
export const dynamic = 'force-dynamic';

export default function ShippingExceptionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
          <p className="text-role-caption text-text-soft">Loading exceptions…</p>
        </div>
      }
    >
      <OrderExceptionsWorkbench />
    </Suspense>
  );
}
