'use client';

import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import { LIFECYCLE, LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import { isEmptyMetaDash, orderRowConditionLabel } from '@/lib/conditions';
import { workStageLifecycleState } from '@/lib/order-lifecycle';
import { orderHubTitle, orderHubTracking, type OrderHubData } from '@/lib/orders/order-hub';
import { sourcePlatformMeta } from '@/lib/source-platform';

/** The channel an order came in on, in words, or null. */
export function orderChannel(source: string | null | undefined): string | null {
  if (!source) return null;
  const meta = sourcePlatformMeta(source);
  return meta.value ? meta.label : source;
}

/**
 * The order hub's read-only summary on {@link DetailSummaryCard}: the
 * Zoho-governed title, tracking · carrier (or the honest "no label"), qty ·
 * condition · channel, the public order # bottom-left and the server stage as a
 * `LIFECYCLE` code bottom-right. The whole card opens `/info`.
 */
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
  const tracking = orderHubTracking(data);
  const shipping = tracking.number ? [tracking.number, tracking.carrier].filter(Boolean).join(' · ') : 'No shipping label yet';
  const quantity = Number(work?.product.quantity ?? order.quantity) || 1;
  const condition = orderRowConditionLabel(work?.product.condition ?? order.condition);
  const facts = [
    `Qty ${quantity}`,
    isEmptyMetaDash(condition) ? null : condition,
    orderChannel(work?.source ?? order.account_source),
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
