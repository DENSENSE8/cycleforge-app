'use client';

import { Suspense } from 'react';
import { DetailFact, DetailFacts, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { useOrderChannel } from '@/hooks/useCatalog';
import { platformDisplayName } from '@/lib/platform-display';
import { useOrderHub } from '@/components/mobile/orders/useOrderHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { LIFECYCLE } from '@/design-system/tokens/lifecycle';
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
  const channelOf = useOrderChannel();
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
        const itemNumber = work?.product.itemNumber ?? order.item_number;
        return (
          <div className="flex-1 divide-y divide-mode-rule">
            <DetailFacts>
              <DetailFact label="Product" value={orderHubTitle(d)} />
              <DetailFact label="Order" value={order.order_id} mono copy={order.order_id} />
              <DetailFact
                label="Stage"
                value={state ? `${LIFECYCLE[state].code} · ${LIFECYCLE[state].label}` : hub.workPending ? '…' : 'Not in outbound'}
                hint={work ? words(work.warehouseStage) ?? undefined : hub.workError ?? undefined}
              />
              <DetailFact
                label="SKU"
                value={order.sku || null}
                mono
                copy={order.sku}
                hint={work && !work.product.paired ? 'Not paired to the catalog' : undefined}
              />
              <DetailFact label="Item #" value={itemNumber || null} mono copy={itemNumber} />
              <DetailFact label="Quantity" value={String(Number(work?.product.quantity ?? order.quantity) || 1)} />
              <DetailFact label="Condition" value={isEmptyMetaDash(condition) ? null : condition} />
              <DetailFact
                label="Platform"
                value={(work?.source ?? order.account_source) ? platformDisplayName(channelOf(order.order_id, work?.source ?? order.account_source)) : null}
              />
            </DetailFacts>
            <DetailSectionHeading>Shipping</DetailSectionHeading>
            <DetailFacts label="Shipping">
              <DetailFact label="Customer" value={order.customer_name ?? null} />
              <DetailFact label="Ship by" value={shipBy ?? null} hint={work?.priority.urgent ? 'Urgent' : undefined} />
              <DetailFact label="Ship to" value={orderShipTo(order) ?? null} />
              <DetailFact
                label="Tracking"
                value={tracking.number || null}
                mono
                copy={tracking.number}
                hint={tracking.carrier ?? undefined}
              />
              <DetailFact
                label="Label"
                value={work ? (work.shippingLabel.live ? 'Live label' : 'No shipping label yet') : null}
                hint={work?.shippingLabel.source ?? (work ? words(work.label.state) ?? undefined : undefined)}
              />
              <DetailFact
                label="Acknowledged"
                value={ack?.at ? formatOrderStamp(ack.at) ?? null : 'Not yet'}
                hint={[ack?.byName, words(ack?.route)].filter(Boolean).join(' · ') || undefined}
              />
              <DetailFact
                label="Stock"
                value={work ? `${work.stock.ready} ready` : null}
                hint={work && work.stock.received > 0 ? `${work.stock.received} received, not tested` : undefined}
              />
              <DetailFact label="Ordered" value={formatOrderStamp(order.order_date ?? order.created_at) ?? null} />
              <DetailFact label="Notes" value={order.note_count > 0 ? plural(order.note_count, 'note') : 'None'} />
            </DetailFacts>
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
