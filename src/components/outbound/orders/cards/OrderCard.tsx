'use client';

/**
 * One ORDER CARD on the To-ship triage list (owner 2026-09-27, BRIEF §13) —
 * the orders family's adapter over the shared {@link RecordCard}.
 *
 * The card's anatomy, motion and disclosure live in RecordCard; this file
 * only says what an order puts in it: its facts (qty · condition · stock ·
 * SKU · bin · price), its lifecycle state and what it means, the SLA as the
 * top-right status, the channel and buyer, the Urgent / SKU-batch chips, and
 * the orders-owned slots — the order number with its admin-link menu, the
 * listing link (or its editor), the quick look and the checked-card menu.
 */

import { memo, useMemo } from 'react';
import { ExternalLink } from '@/components/Icons';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { OrderIdChip } from '@/components/ui/CopyChip';
import { RecordCard, type RecordOpenEvent } from '@/design-system/components/record-card/RecordCard';
import type { RecordCardChip, RecordCardLine, RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import type { RecordFactColumn } from '@/design-system/components/record-card/record-fact';
import { LIFECYCLE_GLYPH } from '@/design-system/components/record-ledger/LifecycleCode';
import { LIFECYCLE, lifecycleRecordState, type LifecycleState } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { CARD_DISCLOSE, CARD_FACT_BOX_CLASS } from '@/design-system/tokens/desk-stage';
import { useOrderChannel } from '@/hooks/useCatalog';
import { platformMetaBrandDot } from '@/lib/source-platform';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { OrderRecordMode } from '@/lib/selection-context/order-inspector-context';
import type { OrderCardLine, OrderCardModel } from '@/lib/orders/order-card-model';
import type { QueueRowClickEvent } from '@/components/dashboard/orders-queue/queue-row-click';
import { ListingLinkEditor, OrderAdminLinkAction } from '../order-link-editors';
import { cn } from '@/utils/_cn';
import { OrderCardActionMenu } from './OrderCardActionMenu';
import { OrderCardPeek } from './OrderCardPeek';

/**
 * An order line's facts, in the one order the lead sentence and the unfolded
 * columns share. SKU and price give way in the unfolded columns below the
 * `label` tier (the quick look keeps them).
 */
const ORDER_FACT_COLUMNS: readonly RecordFactColumn[] = [
  { id: 'qty', tier: 'always' },
  { id: 'condition', tier: 'always' },
  { id: 'stock', tier: 'always' },
  { id: 'sku', tier: 'label' },
  { id: 'bin', tier: 'always' },
  { id: 'price', tier: 'label' },
];

/** What each status icon means — the plain tooltip on every icon but out of stock. */
const STATUS_MEANING: Readonly<Record<LifecycleState, string>> = {
  ready: 'Ready — waiting to be picked',
  urgent: 'Urgent — ship this one first',
  packed: 'Packed — needs a label and scan out',
  outOfStock: 'Out of stock — an item on this order is short',
  shipped: 'Shipped — scanned out',
  onHold: 'On hold — cannot be picked yet',
};

function orderRecordLine(line: OrderCardLine): RecordCardLine {
  return {
    id: line.id,
    title: line.title,
    photoUrl: line.thumbUrl,
    alert: line.outOfStock,
    alertNote: line.shortNote,
    facts: {
      qty: { kind: 'qty', value: line.qty },
      condition: line.condition ? { kind: 'grade', label: line.condition, code: line.conditionCode } : null,
      stock: { kind: 'stock', onHand: line.stock, need: line.qty, out: line.outOfStock, missingTitle: 'No stock record for this SKU' },
      sku: line.sku ? { kind: 'code', text: line.sku, title: 'SKU' } : null,
      bin: { kind: 'place', path: line.bin.path, empty: 'No bin' },
      price: line.price ? { kind: 'money', text: line.price, estimate: line.priceEstimate, estimateTitle: 'Estimate from the listing price' } : null,
    },
  };
}

const moreOutOfStock = (count: number) => `${count} more out of stock`;

export interface OrderCardProps {
  model: OrderCardModel;
  /** Every line checked → true; some → 'mixed'. */
  checked: boolean | 'mixed';
  /** This order is the open record. */
  open: boolean;
  expanded: boolean;
  /** Exactly this card is checked — its actions drop down from the right edge. */
  menuOpen: boolean;
  /** Position in the first paint — staggers the arrival; null = no entrance. */
  enterIndex: number | null;
  mode: OrderRecordMode;
  /**
   * The card body: opens the order's record — never checks it, even with a
   * check-set live (owner 2026-09-27). Only the checkbox checks.
   */
  onOpen: (record: ShippedOrder, event?: QueueRowClickEvent) => void;
  onToggleSelect: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  onToggleGroup: (ids: readonly number[], checked: boolean) => void;
  onToggleExpand: (key: string) => void;
  onMenuDone: () => void;
  onOpenLabels?: (record: ShippedOrder) => void;
  /** Quick look (Space) is unfolded under this card. */
  peekOpen: boolean;
  onTogglePeek: (key: string) => void;
  todayKey: string;
  /** Loaded orders whose lines carry the lead line's SKU (this one included); ≥ 2 shows the batch chip. */
  skuShared: number;
  /** Check every loaded order carrying this SKU — one pick trip. */
  onSelectSku: (sku: string) => void;
}

export const OrderCard = memo(function OrderCard({
  model,
  checked,
  open,
  expanded,
  menuOpen,
  enterIndex,
  mode,
  onOpen,
  onToggleSelect,
  onToggleGroup,
  onToggleExpand,
  onMenuDone,
  onOpenLabels,
  peekOpen,
  onTogglePeek,
  todayKey,
  skuShared,
  onSelectSku,
}: OrderCardProps) {
  const channel = useOrderChannel()(model.orderId, model.accountSource);
  const lead = model.lines[0];

  const record = useMemo<RecordCardModel>(() => {
    const spec = LIFECYCLE[model.state];
    const leadSku = model.lines[0]?.sku ?? null;
    const chips: RecordCardChip[] = [];
    if (model.urgent && model.state !== 'urgent') chips.push({ id: 'urgent', tone: 'warning', short: 'Urgent' });
    if (skuShared > 1 && leadSku) {
      chips.push({
        id: 'sku-batch',
        tone: 'info',
        short: `SKU ×${skuShared}`,
        long: `SKU in ${skuShared} orders`,
        tooltip: `Check all ${skuShared} orders with SKU ${leadSku} — one pick trip`,
        onPress: () => onSelectSku(leadSku),
        testId: 'order-card-sku-batch',
      });
    }
    return {
      key: model.key,
      leadId: model.lead.id,
      state: lifecycleRecordState(model.state),
      stateIcon: LIFECYCLE_GLYPH[spec.icon],
      stateMeaning: STATUS_MEANING[model.state],
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
      channel: channel.label
        ? {
            label: channel.label,
            tooltip: channel.connectionName ?? channel.label,
            dot: <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />,
            badge: model.fba ? 'FBA' : null,
          }
        : null,
      person: model.buyerName,
      chips,
      note: model.buyerNote ? { text: model.buyerNote, label: 'Buyer note' } : null,
      status: model.sla,
      lines: model.lines.map(orderRecordLine),
      hiddenAlertLabel: moreOutOfStock,
    };
  }, [model, channel, skuShared, onSelectSku]);

  if (!lead) return null;

  const openRecord = (event: RecordOpenEvent) => onOpen(model.lead, event);
  const toggleCheck = (event: { shiftKey: boolean }) => {
    if (model.lines.length <= 1) onToggleSelect(model.lead, event);
    else onToggleGroup(model.ids, checked !== true);
  };

  // Hovering the order number flies out "Edit admin link" (opens the link popover); click copies; the ↗ only opens.
  const identity = (
    <OrderAdminLinkAction orderId={model.orderId} href={model.orderHref} storedUrl={model.adminUrl} ids={model.ids} platformLabel={channel.label}>
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
        className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto gap-1 rounded-md px-1 text-[13px] text-text-muted hover:bg-surface-sunken hover:text-text-default', focusRing('control'))}
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
      factColumns={ORDER_FACT_COLUMNS}
      testIdPrefix="order-card"
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
      identity={identity}
      trailing={trailing}
      quickLook={
        <OrderCardPeek
          key="peek"
          model={model}
          todayKey={todayKey}
          platformLabel={channel.connectionName ? `${channel.label} · ${channel.connectionName}` : channel.label}
        />
      }
      menu={{
        open: menuOpen,
        onDone: onMenuDone,
        content: <OrderCardActionMenu record={model.lead} mode={mode} onOpenLabels={onOpenLabels} onDone={onMenuDone} />,
      }}
    />
  );
});
