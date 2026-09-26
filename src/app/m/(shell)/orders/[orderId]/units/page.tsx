'use client';

import { Suspense } from 'react';
import { useOrderHub } from '@/components/mobile/orders/useOrderHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { plural, type OrderHubData } from '@/lib/orders/order-hub';

/** `/m/orders/[orderId]/units` — the serials recorded on this order, read-only. */
function OrderUnitsInner() {
  const hub = useOrderHub();
  return (
    <DetailRecordFrame<OrderHubData>
      record={hub.data}
      state={{ loading: hub.loading, error: hub.error, onRetry: hub.reload }}
      bar={{
        title: hub.data?.order.order_id ?? hub.param,
        mono: true,
        subtitle: 'Units',
        backHref: hub.link(hub.base),
        meta: (d) => plural(d.order.serials.length, 'serial'),
      }}
    >
      {(d) => (
        <div className="flex-1 divide-y divide-mode-rule">
          {d.order.serials.length > 0 ? (
            <ol aria-label={`Serials on ${d.order.order_id}`} className="bg-mode-panel">
              {d.order.serials.map((serial) => (
                <li key={serial} className="min-h-mode-hit border-b border-mode-rule px-mode-page py-3 font-mono text-mode-body text-mode-ink last:border-b-0">
                  {serial}
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">No serials recorded on this order yet.</p>
          )}
        </div>
      )}
    </DetailRecordFrame>
  );
}

export default function OrderUnitsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <OrderUnitsInner />
    </Suspense>
  );
}
