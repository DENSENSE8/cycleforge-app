import { Suspense } from 'react';
import { OrderExceptionsWorkbench } from '@/components/outbound/orders/exceptions/OrderExceptionsWorkbench';

/**
 * `/shipping/exceptions` — the order-exception workbench.
 *
 * Deliberately OUTSIDE the `(desk)` route group: that group's
 * `DeskPageChrome` renders a fixed-width stage, and this surface was specified
 * at full page width. `/shipping/scan-out` sits outside the group for the same
 * reason, so this follows an established precedent rather than inventing a
 * second full-bleed mechanism.
 */
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
