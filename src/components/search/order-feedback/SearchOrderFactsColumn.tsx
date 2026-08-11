'use client';

/**
 * SearchOrderFactsColumn — left column of search order feedback.
 * Item first · platform · units/serials · fulfillment · financials · customer
 * · buyer note · returns · warranty — read-only, flush to the divider.
 *
 * Durable IDs are typed CopyChips (last-8); packout milestones live on the
 * evidence column (`OutboundMilestones`), not re-listed here.
 */

import {
  ConditionGradeChip,
  OrderIdChip,
  SerialChip,
  SkuScanRefChip,
  SourceOrderChip,
  TrackingChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { OrderCustomerFacts } from '@/components/order-record/OrderCustomerFacts';
import { OrderReturnsCard } from '@/components/order-record/OrderReturnsCard';
import { OrderWarrantySummary } from '@/components/order-record/OrderWarrantySummary';
import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import {
  buildAllTrackingRows,
  serialNumberRowsFromShipped,
} from '@/components/shipped/details-panel/shipping-information/helpers';
import { FlushSection } from '@/components/search/order-feedback/FlushSection';
import { normalizeCondition } from '@/components/tech/StationConditionEditor';
import { useOrderChannelLabel, usePlatformMeta } from '@/hooks/useCatalog';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { formatDateTimePST } from '@/utils/date';
import type { ShippedOrder } from '@/types/orders';

function skuChipDisplay(sku: string): string {
  return sku.length > 8 ? getLast8(sku) : sku;
}

export function SearchOrderFactsColumn({ order }: { order: ShippedOrder }) {
  const orderChannelLabel = useOrderChannelLabel();
  const resolvePlatformMeta = usePlatformMeta();
  const channelLabel = orderChannelLabel(order.order_id, order.account_source);
  const fromLabel = sourcePlatformMetaFromLabel(channelLabel);
  const platformMeta = fromLabel.value
    ? resolvePlatformMeta(fromLabel.value)
    : fromLabel;
  const platformLabel = platformMeta.value ? platformMeta.label : null;

  const serials = serialNumberRowsFromShipped(order);
  const trackingRows = buildAllTrackingRows(order);
  const title = String(order.product_title || '').trim() || 'Order';
  const sku = String(order.sku || '').trim();
  const itemNumber = String(order.item_number || '').trim();
  const qty = String(order.quantity ?? '').trim();
  const channel = String(order.fulfillment_channel || '').trim();
  const shipBy = order.ship_by_date ? formatDateTimePST(order.ship_by_date) : null;
  const carrier = String(order.tracking_type || order.shipment_status || '').trim();
  const orderId = String(order.order_id || '').trim();
  const orderRowId = Number(order.id);
  const hasOrderRow = Number.isFinite(orderRowId) && orderRowId > 0;
  const buyerNote = String(order.buyer_note ?? '').trim();
  const sale =
    order.sale_amount != null && order.sale_amount !== ''
      ? `${order.currency ? `${order.currency} ` : ''}${order.sale_amount}`
      : '';
  const carrierHint = String(order.tracking_type || order.carrier || '').trim() || null;

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col gap-0 divide-y divide-border-hairline bg-surface-sunken"
      data-testid="search-order-facts-column"
    >
      <FlushSection title="Item" className="border-0" bodyClassName="bg-surface-card">
        <StackedRowIdentity
          title={
            <p className="min-w-0 text-role-body font-semibold text-text-default">{title}</p>
          }
          trailing={
            order.condition ? (
              <ConditionGradeChip grade={normalizeCondition(String(order.condition))} dense />
            ) : undefined
          }
          keys={
            <>
              {sku ? (
                <SkuScanRefChip value={sku} display={skuChipDisplay(sku)} dense />
              ) : null}
              {itemNumber ? (
                <SourceOrderChip
                  value={itemNumber}
                  display={itemNumber.length > 8 ? getLast8(itemNumber) : itemNumber}
                  dense
                  width="w-fit max-w-full"
                />
              ) : null}
              {orderId ? (
                <OrderIdChip
                  value={orderId}
                  display={getLast8(orderId)}
                  dense
                  platformLabel={platformLabel}
                  truncateDisplay={false}
                  fitDisplayWidth
                />
              ) : null}
            </>
          }
        />
        <OrderFactList cols={2}>
          <OrderFactRow label="Qty" value={qty || null} mono />
        </OrderFactList>
      </FlushSection>

      <FlushSection title="Platform" className="border-0" bodyClassName="bg-surface-card">
        <OrderFactList cols={2}>
          <OrderFactRow
            label="Platform"
            value={
              platformMeta.value ? (
                <HoverTooltip label={platformMeta.label} asChild>
                  <span className="inline-flex shrink-0" aria-label={platformMeta.label}>
                    <PlatformMark platformValue={platformMeta.value} meta={platformMeta} />
                  </span>
                </HoverTooltip>
              ) : null
            }
          />
          <OrderFactRow label="Fulfillment channel" value={channel || null} omitWhenEmpty />
          <OrderFactRow
            label="Order #"
            value={
              orderId ? (
                <OrderIdChip
                  value={orderId}
                  display={getLast8(orderId)}
                  dense
                  platformLabel={platformLabel}
                  truncateDisplay={false}
                  fitDisplayWidth
                />
              ) : null
            }
          />
        </OrderFactList>
      </FlushSection>

      <FlushSection title="Units · serials" className="border-0" bodyClassName="bg-surface-card">
        {serials.length === 0 ? (
          <p className="text-role-caption text-text-faint">—</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {serials.map((serial) => (
              <li key={serial} className="flex min-w-0 items-center gap-2">
                <SerialChip value={serial} width="w-fit max-w-full" dense />
              </li>
            ))}
          </ul>
        )}
      </FlushSection>

      <FlushSection title="Fulfillment" className="border-0" bodyClassName="bg-surface-card">
        <OrderFactList cols={1}>
          <OrderFactRow
            label="Tracking"
            span
            value={
              trackingRows.length > 0 ? (
                <div className="flex flex-col items-start gap-1">
                  {trackingRows.map((row) => (
                    <TrackingChip
                      key={row.tracking}
                      value={row.tracking}
                      dense
                      carrierHint={carrierHint}
                    />
                  ))}
                </div>
              ) : null
            }
          />
          <OrderFactRow label="Carrier / status" value={carrier || null} />
          <OrderFactRow label="Ship by" value={shipBy} />
        </OrderFactList>
      </FlushSection>

      <FlushSection title="Financials" className="border-0" bodyClassName="bg-surface-card">
        <OrderFactList>
          <OrderFactRow label="Sale amount" value={sale || null} />
          <OrderFactRow label="Fees" value={null} />
          <OrderFactRow label="Net payout" value={null} />
        </OrderFactList>
        {!sale ? (
          <p className="mt-2 text-role-micro font-medium text-text-faint">
            Not reconciled — no linked commercial document yet.
          </p>
        ) : null}
      </FlushSection>

      <FlushSection title="Customer" className="border-0" bodyClassName="bg-surface-card">
        <OrderCustomerFacts customerId={order.customer_id ?? null} />
      </FlushSection>

      {buyerNote ? (
        <FlushSection title="Buyer note" className="border-0" bodyClassName="bg-surface-card">
          <p className="whitespace-pre-line break-words text-role-caption font-medium text-text-default">
            {buyerNote}
          </p>
        </FlushSection>
      ) : null}

      {hasOrderRow ? <OrderReturnsCard orderId={orderRowId} chrome="flush" /> : null}

      <FlushSection title="Warranty" className="border-0" bodyClassName="bg-surface-card">
        <OrderWarrantySummary order={order} />
      </FlushSection>
    </div>
  );
}
