'use client';

/**
 * One order on ONE row — the Compact face of the Allocate list (Full is
 * {@link OrderCard}). The card's anatomy, left → right: state · photo ·
 * order number (last eight visually) · the lead line's title (+N more lines) ·
 * platform/store · buyer · condition · price · units. Ship-by and the
 * next step pin to the right while the shared list plane scrolls horizontally.
 * The facts are the card's own
 * (`orderRecordLine` → `orderLineFacts`), so both faces paint one truth.
 */

import { memo, useMemo } from 'react';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { LIFECYCLE } from '@/design-system/tokens/lifecycle';
import { useOrderChannel } from '@/hooks/useCatalog';
import { formatOrderIdDisplay } from '@/lib/copy-chip-format';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { orderRecordLine, type OrderCardModel } from '@/lib/orders/order-card-model';
import { platformDisplayName } from '@/lib/platform-display';
import { OUTBOUND_TRIAGE_VIEW } from '@/lib/triage/views';

export const OrderRow = memo(function OrderRow(props: TriageCardSlotProps<ShippedOrder, OrderCardModel>) {
  const { model } = props;
  const channel = useOrderChannel()(model.orderId, model.accountSource);
  const channelName = platformDisplayName(channel);
  const face = useMemo<TriageRowFace | null>(() => {
    const leadLine = model.lines[0];
    if (!leadLine) return null;
    const lead = orderRecordLine(leadLine);
    const more = model.lines.length > 1 ? ` +${model.lines.length - 1}` : '';
    const title = `${lead.title}${more}`;
    const stateLabel = LIFECYCLE[model.state].label;
    return {
      state: model.state,
      identity: model.orderId,
      identityDisplay: formatOrderIdDisplay(model.orderId),
      identityWidth: 'code',
      title,
      photo: { url: lead.photoUrl },
      wide: true,
      facts: [
        {
          id: 'platform',
          value: `${channelName}${model.fba ? ' · FBA' : model.pickup ? ' · Pickup' : ''}`,
          width: 'long',
          tip: channelName,
        },
        { id: 'buyer', value: model.buyerName ?? '—', width: 'long', tip: model.buyerName ?? undefined },
        { id: 'condition', value: lead.facts.condition ?? null, width: 'short' },
        { id: 'price', value: lead.facts.price ?? null, width: 'short' },
        { id: 'qty', value: { kind: 'qty', value: model.units, multiplier: 'multiple' }, width: 'num', tip: `${model.units} ${model.units === 1 ? 'unit' : 'units'}` },
      ],
      endFact: {
        id: 'ship-by',
        value: model.sla.face,
        width: 'short',
        tone: model.sla.tone === 'late' ? 'warn' : 'muted',
        tip: model.sla.tip ?? undefined,
      },
      stickyEnd: true,
      next: model.next ? { label: model.next.label, blocked: model.next.blocked } : null,
      nextWidth: 'code',
      aria: {
        row: `Order ${model.orderId}, ${stateLabel}, ${title}`,
        open: `Open order ${model.orderId}`,
        check: `Select order ${model.orderId}`,
      },
    };
  }, [model, channelName]);
  if (!face) return null;
  return (
    <TriageRow
      {...props}
      face={face}
      testIdPrefix={OUTBOUND_TRIAGE_VIEW.testIdPrefix}
      rowAttrs={{ 'data-order-row-id': model.lead.id }}
    />
  );
});
