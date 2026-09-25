'use client';

import { Suspense } from 'react';
import { useOrderHub } from '@/components/mobile/orders/useOrderHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { activityTitle, formatOrderStamp, plural, type OrderHubData } from '@/lib/orders/order-hub';

/** `/m/orders/[orderId]/activity` — the order's recent work, newest first, read-only. */
function OrderActivityInner() {
  const hub = useOrderHub();
  return (
    <DetailRecordFrame<OrderHubData>
      record={hub.data}
      state={{ loading: hub.loading, error: hub.error, onRetry: hub.reload }}
      bar={{
        title: hub.data?.order.order_id ?? hub.param,
        mono: true,
        subtitle: 'Activity',
        backHref: hub.link(hub.base),
        meta: (d) => plural(d.activity.length, 'event'),
      }}
    >
      {(d) => (
        <div className="flex-1 space-y-4 px-mode-page py-mode-page">
          {d.activity.length > 0 ? (
            <ol aria-label={`Activity on ${d.order.order_id}`} className="overflow-hidden rounded-mode border border-mode-edge bg-mode-panel">
              {d.activity.map((event, index) => (
                <li key={`${event.event_at}-${index}`} className="border-b border-mode-rule px-mode-page py-3 last:border-b-0">
                  <p className="text-mode-body font-semibold text-mode-ink">{activityTitle(event)}</p>
                  <p className="mt-0.5 text-role-caption text-mode-muted">
                    {[event.actor_name || 'Unassigned', formatOrderStamp(event.event_at)].filter(Boolean).join(' · ')}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-10 text-center text-sm font-semibold text-text-soft">Nothing recorded on this order yet.</p>
          )}
        </div>
      )}
    </DetailRecordFrame>
  );
}

export default function OrderActivityPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <OrderActivityInner />
    </Suspense>
  );
}
