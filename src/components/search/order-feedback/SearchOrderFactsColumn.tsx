'use client';

/**
 * SearchOrderFactsColumn — left column of search order feedback.
 * Item first · platform · units/serials · fulfillment · financials · customer
 * · buyer note · returns · warranty — read-only, flush to the divider.
 */

import { ConditionGradeChip, SerialChip, SkuScanRefChip } from '@/components/ui/CopyChip';
import { TrackingNumberRow } from '@/components/ui/TrackingNumberRow';
import { OrderCustomerFacts } from '@/components/order-record/OrderCustomerFacts';
import { OrderReturnsCard } from '@/components/order-record/OrderReturnsCard';
import { OrderWarrantySummary } from '@/components/order-record/OrderWarrantySummary';
import { OrderFactList, OrderFactRow } from '@/components/order-record/order-record-card';
import {
  buildAllTrackingRows,
  deriveShippingDisplayMeta,
  serialNumberRowsFromShipped,
} from '@/components/shipped/details-panel/shipping-information/helpers';
import { FlushSection } from '@/components/search/order-feedback/FlushSection';
import { normalizeCondition } from '@/components/tech/StationConditionEditor';
import { formatDateTimePST } from '@/utils/date';
import { getAccountSourceLabel } from '@/utils/order-links';
import type { ShippedOrder } from '@/types/orders';

export function SearchOrderFactsColumn({ order }: { order: ShippedOrder }) {
  const platformLabel = getAccountSourceLabel(order.order_id, order.account_source);
  const serials = serialNumberRowsFromShipped(order);
  const trackingRows = buildAllTrackingRows(order);
  const meta = deriveShippingDisplayMeta(order, serials);
  const title = String(order.product_title || '').trim() || 'Order';
  const sku = String(order.sku || '').trim();
  const itemNumber = String(order.item_number || '').trim();
  const qty = String(order.quantity ?? '').trim();
  const channel = String(order.fulfillment_channel || '').trim();
  const shipBy = order.ship_by_date ? formatDateTimePST(order.ship_by_date) : null;
  const carrier = String(order.tracking_type || order.shipment_status || '').trim();
  const orderRowId = Number(order.id);
  const hasOrderRow = Number.isFinite(orderRowId) && orderRowId > 0;
  const buyerNote = String(order.buyer_note ?? '').trim();
  const sale =
    order.sale_amount != null && order.sale_amount !== ''
      ? `${order.currency ? `${order.currency} ` : ''}${order.sale_amount}`
      : '';

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col gap-0 divide-y divide-border-hairline bg-surface-sunken"
      data-testid="search-order-facts-column"
    >
      <FlushSection title="Item" className="border-0" bodyClassName="bg-surface-card">
        <div className="stack-tight">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-role-body font-semibold text-text-default">{title}</p>
            {order.condition ? (
              <ConditionGradeChip grade={normalizeCondition(String(order.condition))} dense />
            ) : null}
          </div>
          <OrderFactList cols={2}>
            <OrderFactRow
              label="SKU"
              value={sku ? <SkuScanRefChip value={sku} display={sku} dense /> : null}
              omitWhenEmpty
            />
            <OrderFactRow label="Item #" value={itemNumber || null} mono omitWhenEmpty />
            <OrderFactRow label="Qty" value={qty || null} mono omitWhenEmpty />
          </OrderFactList>
        </div>
      </FlushSection>

      <FlushSection title="Platform" className="border-0" bodyClassName="bg-surface-card">
        <OrderFactList cols={2}>
          <OrderFactRow label="Platform" value={platformLabel || null} />
          <OrderFactRow label="Account source" value={order.account_source} />
          <OrderFactRow label="Fulfillment channel" value={channel || null} omitWhenEmpty />
          <OrderFactRow label="Order #" value={order.order_id} mono />
        </OrderFactList>
      </FlushSection>

      <FlushSection title="Units · serials" className="border-0" bodyClassName="bg-surface-card">
        {serials.length === 0 ? (
          <p className="text-role-caption text-text-faint">—</p>
        ) : (
          <ul className="flex flex-col gap-2">
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
                <div className="flex flex-col gap-1.5">
                  {trackingRows.map((row) => (
                    <TrackingNumberRow key={row.tracking} value={row.tracking} />
                  ))}
                </div>
              ) : null
            }
          />
          <OrderFactRow label="Carrier / status" value={carrier || null} omitWhenEmpty />
          <OrderFactRow label="Ship by" value={shipBy} omitWhenEmpty />
          <OrderFactRow
            label="Tested"
            value={
              meta.testedAtSource
                ? `${meta.techNameDisplay} · ${meta.testedAtDateTimeDisplay}`
                : null
            }
            omitWhenEmpty
          />
          <OrderFactRow
            label="Packed"
            value={
              meta.packedAtSource
                ? `${meta.packerNameDisplay} · ${meta.shippedAtDisplay}`
                : null
            }
            omitWhenEmpty
          />
          <OrderFactRow
            label="Scanned out"
            value={
              meta.isScannedOut
                ? `${meta.scannedOutByDisplay ?? '—'} · ${meta.scannedOutDisplay}`
                : null
            }
            omitWhenEmpty
          />
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

      {hasOrderRow ? <OrderReturnsCard orderId={orderRowId} /> : null}

      <FlushSection title="Warranty" className="border-0" bodyClassName="bg-surface-card">
        <OrderWarrantySummary order={order} />
      </FlushSection>
    </div>
  );
}
