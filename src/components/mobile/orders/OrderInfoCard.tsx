'use client';

import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import { LIFECYCLE, LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import { isEmptyMetaDash, orderRowConditionLabel } from '@/lib/conditions';
import { workStageLifecycleState } from '@/lib/order-lifecycle';
import { orderHubTitle, orderHubTracking, type OrderHubData } from '@/lib/orders/order-hub';
import { useOrderChannel } from '@/hooks/useCatalog';
import { platformDisplayName } from '@/lib/platform-display';

/** The order hub's read-only summary on {@link DetailSummaryCard}: */
export function OrderInfoCard({
  data,
  href,
  stagePending,
}: {
  data: OrderHubData;
  href: string;
  stagePending: boolean;
}) {
  const { order, work } = data;
  const channelOf = useOrderChannel();
  const source = work?.source ?? order.account_source;
  const tracking = orderHubTracking(data);
  const shipping = tracking.number ? [tracking.number, tracking.carrier].filter(Boolean).join(' · ') : 'No shipping label yet';
  const quantity = Number(work?.product.quantity ?? order.quantity) || 1;
  const condition = orderRowConditionLabel(work?.product.condition ?? order.condition);
  const facts = [
    `Qty ${quantity}`,
    isEmptyMetaDash(condition) ? null : condition,
    source ? platformDisplayName(channelOf(order.order_id, source)) : null,
  ].filter(Boolean);
  const state = work ? workStageLifecycleState(work.warehouseStage, { urgent: work.priority.urgent }) : null;
  return (
    <DetailSummaryCard
      href={href}
      ariaLabel="Order details"
      title={orderHubTitle(data)}
      lines={[{ text: shipping }, { text: facts.join(' · '), muted: true }]}
      foot={order.order_id}
      chip={
        state
          ? {
              label: `${LIFECYCLE[state].code} · ${LIFECYCLE[state].label}`,
              className: `${LIFECYCLE_CLASSES[state].pill} ${LIFECYCLE_CLASSES[state].border}`,
            }
          : null
      }
      chipFallback={stagePending ? '…' : 'Not in outbound'}
    />
  );
}
