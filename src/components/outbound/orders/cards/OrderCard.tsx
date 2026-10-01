'use client';

/**
 * One ORDER CARD on the To-ship triage list (owner 2026-09-27, BRIEF §13) —
 * the orders family's adapter over the shared {@link RecordCard}.
 *
 * The card's anatomy, motion and disclosure live in RecordCard; this file
 * only says what an order puts in it: its facts (qty · condition · price),
 * its lifecycle state and what it means, the SLA as the
 * top-right status, the channel and buyer, the Urgent / SKU-batch chips, and
 * the orders-owned slots — the order number with its admin-link menu, the
 * listing link (or its editor) and the quick look. A checked card's verbs
 * live only in the selection bar (Law 5).
 */

import { memo, useMemo } from 'react';
import { ExternalLink } from '@/components/Icons';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OrderIdChip } from '@/components/ui/CopyChip';
import { RecordCard, type RecordOpenEvent } from '@/design-system/components/record-card/RecordCard';
import type { RecordCardChip, RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import { OUTBOUND_TRIAGE_VIEW } from '@/lib/triage/views';
import { LIFECYCLE_GLYPH } from '@/design-system/components/record-ledger/LifecycleCode';
import { LIFECYCLE, lifecycleRecordState, type LifecycleState } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { CARD_DISCLOSE, CARD_FACT_BOX_CLASS } from '@/design-system/tokens/desk-stage';
import { useOrderChannel } from '@/hooks/useCatalog';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { platformDisplayName } from '@/lib/platform-display';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { orderRecordLine, type OrderCardModel } from '@/lib/orders/order-card-model';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { ListingLinkEditor, OrderAdminLinkAction } from '../order-link-editors';
import { cn } from '@/utils/_cn';
import { OrderCardPeek } from './OrderCardPeek';

/** What each status icon means — the plain tooltip on every icon but out of stock. */
const STATUS_MEANING: Readonly<Record<LifecycleState, string>> = {
  toPick: 'To pick — nobody has picked it yet',
  picked: 'Picked — waiting to be packed',
  urgent: 'Urgent — ship this one first',
  packed: 'Packed — needs a label and scan out',
  outOfStock: 'Out of stock — an item on this order is short',
  shipped: 'Fulfilled — scanned out',
  onHold: 'On hold — cannot be picked yet',
};

const moreOutOfStock = (count: number) => `${count} more out of stock`;

/** The face's slot props (state + its handlers) plus what only an order card reads. */
export interface OrderCardProps extends TriageCardSlotProps<ShippedOrder, OrderCardModel> {
  todayKey: string;
  /** Save the order's staff note from line 1 (appends to the notes trail). */
  onSaveNote: (record: ShippedOrder, text: string) => void;
}

export const OrderCard = memo(function OrderCard({
  model,
  checked,
  open,
  expanded,
  enterIndex,
  onOpen,
  onToggleCheck,
  onToggleExpand,
  peekOpen,
  onTogglePeek,
  todayKey,
  onSaveNote,
}: OrderCardProps) {
  const channel = useOrderChannel()(model.orderId, model.accountSource);
  const channelName = platformDisplayName(channel);
  const lead = model.lines[0];

  const record = useMemo<RecordCardModel>(() => {
    const spec = LIFECYCLE[model.state];
    const chips: RecordCardChip[] = [];
    const urgentWord = model.urgentLabel ?? 'Urgent';
    // The chip names a paid-for service ("Expedited") even on an urgent-state card; a plain
    // operator Urgent is already the state icon there, so it needs no chip.
    if (model.urgent && (model.state !== 'urgent' || urgentWord !== 'Urgent')) {
      chips.push({ id: 'urgent', tone: 'warning', short: urgentWord });
    }
    return {
      key: model.key,
      leadId: model.lead.id,
      state: lifecycleRecordState(model.state),
      stateIcon: LIFECYCLE_GLYPH[spec.icon],
      stateMeaning:
        model.state === 'urgent' && urgentWord !== 'Urgent'
          ? `${urgentWord} — ship this one first`
          : STATUS_MEANING[model.state],
      alert:
        model.outOfStockCount > 0
          ? {
              count: model.outOfStockCount,
              summary: `${model.outOfStockCount} of ${model.lines.length} out of stock`,
              ariaLabel: `${spec.label}, ${model.outOfStockCount} of ${model.lines.length} lines out of stock`,
            }
          : null,
      aria: {
        card: `Order ${model.orderId}, ${spec.label}, ${model.lines[0]?.title ?? ''}`,
        open: `Open order ${model.orderId}`,
        check: `Select order ${model.orderId}`,
      },
      channel: channelName
        ? {
            label: channelName,
            tooltip: channelName,
            dot: <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />,
            badge: model.fba ? 'FBA' : model.pickup ? 'Pickup' : null,
          }
          : null,
      person: model.buyerName,
      chips,
      // The buyer's words read-only; the team's latest note edited in line (the notes trail keeps history).
      notes: {
        fixed: model.buyerNote ? { label: 'Buyer note', text: model.buyerNote } : null,
        own: model.staffNote,
      },
      status: { kind: 'deadline', ...model.sla },
      next: model.next,
      lines: model.lines.map(orderRecordLine),
      hiddenAlertLabel: moreOutOfStock,
    };
  }, [model, channel, channelName]);

  if (!lead) return null;

  const openRecord = (event: RecordOpenEvent) => onOpen(model.lead, event);
  const toggleCheck = (event: { shiftKey: boolean }) => onToggleCheck(model, event);

  // Hovering the order number flies out "Edit admin link" (opens the link popover); click copies; the ↗ only opens.
  const identity = (
    <OrderAdminLinkAction
      orderId={model.orderId}
      href={model.orderHref}
      storedUrl={model.adminUrl}
      ids={model.ids}
      platformLabel={channelName}
      showInlineOpen={false}
    >
      <OrderIdChip value={model.orderId} display={model.orderId} plain dense truncateDisplay={false} fitDisplayWidth disableTooltip />
    </OrderAdminLinkAction>
  );

  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const trailing = model.listingHref ? (
    <HoverTooltip label={model.listingItem ? `Open listing ${model.listingItem}` : 'Open listing'} asChild>
      <a
        href={model.listingHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        onPointerDown={stop}
        data-testid="order-card-open-listing"
        aria-label={model.listingItem ? `Open listing ${model.listingItem} in a new tab` : 'Open listing in a new tab'}
        className={cn(
          CARD_FACT_BOX_CLASS,
          'pointer-events-auto gap-1 rounded-md px-1 text-[13px] text-text-muted opacity-0 transition-opacity hover:bg-surface-sunken hover:text-text-default focus-visible:opacity-100 group-focus-within/card:opacity-100 group-hover/card:opacity-100',
          focusRing('control'),
        )}
      >
        <span className={CARD_DISCLOSE.label.show}>Listing</span>
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
    </HoverTooltip>
  ) : (
    <span className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto')}>
      <ListingLinkEditor
        face="label"
        currentItem={null}
        targets={model.lines.map((line) => ({
          id: line.id,
          itemNumber: line.record.item_number ?? null,
          accountSource: line.record.account_source ?? null,
        }))}
      />
    </span>
  );

  return (
    <RecordCard
      model={record}
      factColumns={OUTBOUND_TRIAGE_VIEW.facts}
      testIdPrefix={OUTBOUND_TRIAGE_VIEW.testIdPrefix}
      rowAttrs={{ 'data-order-row-id': model.lead.id }}
      checked={checked}
      open={open}
      expanded={expanded}
      peekOpen={peekOpen}
      enterIndex={enterIndex}
      onOpen={openRecord}
      onToggleCheck={toggleCheck}
      onToggleExpand={() => onToggleExpand(model.key)}
      onTogglePeek={() => onTogglePeek(model.key)}
      identity={{ role: 'identity', content: identity }}
      trailing={{ role: 'trailing', content: trailing }}
      quickLook={
        <OrderCardPeek
          key="peek"
          model={model}
          todayKey={todayKey}
        />
      }
      onSaveNote={(text) => onSaveNote(model.lead, text)}
    />
  );
});
