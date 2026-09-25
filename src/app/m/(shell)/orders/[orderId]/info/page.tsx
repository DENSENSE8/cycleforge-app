'use client';

import { Suspense } from 'react';
import { DetailFactRow } from '@/components/mobile/detail/DetailParts';
import { orderChannel } from '@/components/mobile/orders/OrderInfoCard';
import { useOrderHub } from '@/components/mobile/orders/useOrderHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { LIFECYCLE } from '@/design-system/tokens/lifecycle';
import { Panel } from '@/design-system/primitives';
import { isEmptyMetaDash, orderRowConditionLabel } from '@/lib/conditions';
import { workStageLifecycleState } from '@/lib/order-lifecycle';
import {
  formatOrderStamp,
  orderHubTitle,
  orderHubTracking,
  orderShipTo,
  plural,
  type OrderHubData,
} from '@/lib/orders/order-hub';

const words = (raw: string | null | undefined) => (raw ? raw.replace(/_/g, ' ').toLowerCase() : null);

/**
 * `/m/orders/[orderId]/info` — every fact about the order, read-only. Order
 * writes live on the desk and in the jobs (pick, pack, exceptions); there is
 * no order-field edit on the phone, so this screen carries no pencil.
 */
function OrderInfoInner() {
  const hub = useOrderHub();
  return (
    <DetailRecordFrame<OrderHubData>
      record={hub.data}
      state={{ loading: hub.loading, error: hub.error, onRetry: hub.reload }}
      bar={{
        title: hub.data?.order.order_id ?? hub.param,
        mono: true,
        subtitle: 'Order details',
        backHref: hub.link(hub.base),
      }}
    >
      {(d) => {
        const { order, work } = d;
        const tracking = orderHubTracking(d);
        const state = work ? workStageLifecycleState(work.warehouseStage, { urgent: work.priority.urgent }) : null;
        const condition = orderRowConditionLabel(work?.product.condition ?? order.condition);
        const shipBy = formatOrderStamp(work?.priority.shipBy ?? order.ship_by_date);
        const ack = work?.acknowledgment;
        return (
          <div className="flex-1 space-y-4 px-mode-page py-mode-page">
            <Panel radius="none" padding="none" elevation="none" className="rounded-mode">
              <DetailFactRow label="Order" value={<span className="font-mono">{order.order_id}</span>} />
              <DetailFactRow
                label="Stage"
                value={state ? `${LIFECYCLE[state].code} · ${LIFECYCLE[state].label}` : hub.workPending ? '…' : 'Not in outbound'}
                hint={work ? words(work.warehouseStage) ?? undefined : hub.workError ?? undefined}
              />
              <DetailFactRow label="Product" value={orderHubTitle(d)} />
              <DetailFactRow
                label="SKU"
                value={order.sku ? <span className="font-mono">{order.sku}</span> : '—'}
                hint={work && !work.product.paired ? 'Not paired to the catalog' : undefined}
              />
              <DetailFactRow
                label="Item #"
                value={(work?.product.itemNumber ?? order.item_number) ? <span className="font-mono">{work?.product.itemNumber ?? order.item_number}</span> : '—'}
              />
              <DetailFactRow label="Quantity" value={String(Number(work?.product.quantity ?? order.quantity) || 1)} />
              <DetailFactRow label="Condition" value={isEmptyMetaDash(condition) ? '—' : condition} />
              <DetailFactRow label="Channel" value={orderChannel(work?.source ?? order.account_source) ?? '—'} />
            </Panel>
            <Panel radius="none" padding="none" elevation="none" className="rounded-mode">
              <DetailFactRow label="Customer" value={order.customer_name ?? '—'} />
              <DetailFactRow label="Ship to" value={orderShipTo(order) ?? '—'} />
              <DetailFactRow label="Ship by" value={shipBy ?? '—'} hint={work?.priority.urgent ? 'Urgent' : undefined} />
              <DetailFactRow
                label="Tracking"
                value={tracking.number ? <span className="font-mono">{tracking.number}</span> : '—'}
                hint={tracking.carrier ?? undefined}
              />
              <DetailFactRow
                label="Label"
                value={work ? (work.shippingLabel.live ? 'Live label' : 'No shipping label yet') : '—'}
                hint={work?.shippingLabel.source ?? (work ? words(work.label.state) ?? undefined : undefined)}
              />
              <DetailFactRow
                label="Acknowledged"
                value={ack?.at ? formatOrderStamp(ack.at) ?? '—' : 'Not yet'}
                hint={[ack?.byName, words(ack?.route)].filter(Boolean).join(' · ') || undefined}
              />
              <DetailFactRow
                label="Stock"
                value={work ? `${work.stock.ready} ready` : '—'}
                hint={work && work.stock.received > 0 ? `${work.stock.received} received, not tested` : undefined}
              />
              <DetailFactRow label="Notes" value={order.note_count > 0 ? plural(order.note_count, 'note') : 'None'} />
              <DetailFactRow label="Ordered" value={formatOrderStamp(order.order_date ?? order.created_at) ?? '—'} />
            </Panel>
          </div>
        );
      }}
    </DetailRecordFrame>
  );
}

export default function OrderInfoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <OrderInfoInner />
    </Suspense>
  );
}
