'use client';

/**
 * OrderRecordBody — the single-scroll durable order record on `/o/[orderId]`.
 *
 * Main column: Item · photos · Fulfillment · Financials · Documents · Timeline,
 * with Serial Journey + Conversation collapsed by default. Right rail: Customer ·
 * Buyer note · Returns · Warranty. Identity (order # / platform / status) lives
 * in the page header — not reprinted here.
 *
 * SCOPE — durable Workbench record only (`OrderFullPageView` → `/o/[orderId]`).
 * Search feedback is `SearchOrderFeedback`. Desk table click is tabbed
 * `ShippedDetailsPanel` → `ShippedDetailsBody`. Do not mount this body in those
 * shells.
 */

import type { ReactNode } from 'react';
import { AlertTriangle, Package, Zap } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
import {
  OrderFactList,
  OrderFactRow,
  OrderRecordCard,
} from '@/components/order-record/order-record-card';
import { OrderCollapsibleSection } from '@/components/order-record/OrderCollapsibleSection';
import { OrderCustomerFacts } from '@/components/order-record/OrderCustomerFacts';
import { OrderFulfillmentFacts } from '@/components/order-record/OrderFulfillmentFacts';
import { OrderItemFacts } from '@/components/order-record/OrderItemFacts';
import { OrderReturnsCard } from '@/components/order-record/OrderReturnsCard';
import { OrderWarrantySummary } from '@/components/order-record/OrderWarrantySummary';
import {
  isSearchOrderFactEmpty,
  isShipByBeforeCreated,
} from '@/components/order-record/order-fact-presence';
import type { EditableShippingFields } from '@/components/shipped/details-panel/shipping-information/types';
import { OrderTimelineSection } from '@/components/shipped/OrderTimelineSection';
import { SerialJourneySection } from '@/components/serial/SerialJourneySection';
import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import { PhotoGallery, type PhotoGalleryInput } from '@/components/shipped/PhotoGallery';
import type { ShippedOrder } from '@/types/orders';
import { cn } from '@/utils/_cn';

/**
 * `full` — the `/o/[orderId]` page and Search detail: main + right rail side by
 * side from `lg`. `compact` — the slide-over (~420px): the rail stacks under the
 * main column, since there is no width for two.
 */
type OrderRecordDensity = 'full' | 'compact';

interface OrderRecordBodyProps {
  order: ShippedOrder;
  density?: OrderRecordDensity;
  /** Documents upload/delete is enabled only where the surface owns that job. */
  documentsReadOnly?: boolean;
  /**
   * Editing passthroughs for Fulfillment (tracking / ship-by via the edit
   * modal). Omit them and the record reads read-only.
   */
  editableShippingFields?: EditableShippingFields;
  copiedAll?: boolean;
  onCopyAll?: () => void;
  onUpdate?: () => void;
  /**
   * Opens the work-order assignment card. Omitted → the control hides.
   */
  onAssign?: () => void;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const t = String(v ?? '').trim();
    if (t) return t;
  }
  return '';
}

function anyPresent(...values: ReactNode[]): boolean {
  return values.some((v) => !isSearchOrderFactEmpty(v));
}

/** Full-width attention banner — exceptions hijack the top of the record. */
function ExceptionBanner({
  tone,
  icon,
  children,
}: {
  tone: 'warning' | 'danger';
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2',
        tone === 'danger'
          ? 'border-rose-200 bg-rose-50 text-text-danger'
          : 'border-amber-200 bg-amber-50 text-text-warning',
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="text-role-caption font-semibold">{children}</p>
    </div>
  );
}

export function OrderRecordBody({
  order,
  density = 'full',
  documentsReadOnly = true,
  editableShippingFields,
  copiedAll,
  onCopyAll,
  onUpdate,
  onAssign,
}: OrderRecordBodyProps) {
  const orderRowId = Number(order.id);
  const hasOrderRow = Number.isFinite(orderRowId) && orderRowId > 0;
  const twoUp = density === 'full';

  const tracking = firstNonEmpty(order.shipping_tracking_number, ...(order.tracking_numbers ?? []));
  const sale =
    order.sale_amount != null && order.sale_amount !== ''
      ? `${order.currency ? `${order.currency} ` : ''}${order.sale_amount}`
      : '';

  const photos = (order.packer_photos_url ?? []) as PhotoGalleryInput[];
  const hasPhotos = Array.isArray(photos) && photos.length > 0;

  const shipByAnomaly = isShipByBeforeCreated(order.ship_by_date, order.created_at);

  const serials = [
    ...new Set(
      String(order.serial_number || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];

  const isUrgent = Boolean((order as { is_urgent?: unknown }).is_urgent);
  const isOutOfStock = Boolean((order as { is_out_of_stock?: unknown }).is_out_of_stock);
  const buyerNote = String(order.buyer_note ?? '').trim();

  const hasItem = anyPresent(order.product_title, order.sku, order.item_number, order.quantity, sale);
  const hasFulfillment = anyPresent(
    tracking,
    order.carrier,
    order.shipment_status,
    order.latest_status_label,
    order.latest_event_at,
    order.ship_confirmed_at,
    order.ship_by_date,
    order.packed_at,
    order.packed_by_name,
    order.tracking_type,
  );
  const hasExceptions = isOutOfStock || isUrgent || shipByAnomaly;

  return (
    <div className="stack-section">
      {hasExceptions ? (
        <div className="stack-tight">
          {isOutOfStock ? (
            <ExceptionBanner tone="danger" icon={<Package className="h-4 w-4" />}>
              Marked out of stock — this order is blocked from packout.
            </ExceptionBanner>
          ) : null}
          {isUrgent ? (
            <ExceptionBanner tone="warning" icon={<Zap className="h-4 w-4" />}>
              Flagged urgent — expedite ahead of the standard queue.
            </ExceptionBanner>
          ) : null}
          {shipByAnomaly ? (
            <ExceptionBanner tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
              Ship-by is before the order was created — check the marketplace clock or import.
            </ExceptionBanner>
          ) : null}
        </div>
      ) : null}

      <div className={cn('grid grid-cols-1 gap-4', twoUp && 'lg:grid-cols-3')}>
        <div className={cn('stack-section', twoUp && 'lg:col-span-2')}>
          {hasItem ? (
            <OrderRecordCard title="Item">
              <OrderItemFacts order={order} editableShippingFields={editableShippingFields} />
            </OrderRecordCard>
          ) : null}

          {hasPhotos ? (
            <OrderRecordCard title="Packing photos">
              <PhotoGallery photos={photos} orderId={order.order_id} launcherLayout="thumbnails" />
            </OrderRecordCard>
          ) : null}

          {hasFulfillment ? (
            <OrderRecordCard
              title="Fulfillment"
              actions={
                onAssign ? (
                  <Button type="button" variant="secondary" size="sm" onClick={onAssign}>
                    Assign
                  </Button>
                ) : null
              }
            >
              <OrderFulfillmentFacts
                order={order}
                copiedAll={copiedAll}
                onCopyAll={onCopyAll}
                onUpdate={onUpdate}
                editableShippingFields={editableShippingFields}
              />
            </OrderRecordCard>
          ) : null}

          {/* Financials — D11: shell always renders; fees/payout labeled until
              the commercial keyspace bridge lands. */}
          <OrderRecordCard title="Financials">
            <OrderFactList>
              <OrderFactRow label="Sale amount" value={sale} />
              <OrderFactRow label="Fees" value="" />
              <OrderFactRow label="Net payout" value="" />
            </OrderFactList>
            {!sale ? (
              <p className="text-role-micro font-medium text-text-faint">
                Not reconciled — no linked commercial document yet.
              </p>
            ) : null}
          </OrderRecordCard>

          {hasOrderRow ? (
            <OrderRecordCard title="Documents">
              <OrderDocumentsSection
                orderId={orderRowId}
                orderRef={order.order_id || `order-${orderRowId}`}
                readOnly={documentsReadOnly}
              />
            </OrderRecordCard>
          ) : null}

          {hasOrderRow ? <OrderTimelineSection orderId={orderRowId} /> : null}

          {hasOrderRow && serials.length > 0
            ? serials.map((sn) => (
                <OrderCollapsibleSection
                  key={sn}
                  title={serials.length > 1 ? `Item Journey · ${sn}` : 'Item Journey'}
                  description="Serial lifecycle — expand when you need the unit trail."
                >
                  <div className="p-3">
                    <SerialJourneySection
                      serialNumber={sn}
                      title="Events"
                      density="compact"
                      withPhotos={false}
                    />
                  </div>
                </OrderCollapsibleSection>
              ))
            : null}

          {hasOrderRow ? (
            <OrderCollapsibleSection
              title="Conversation"
              description="Internal notes and linked support threads."
              bodyClassName="flex h-[min(50vh,24rem)] min-h-[16rem] flex-col"
            >
              <ThreadPanel entityType="ORDER" entityId={orderRowId} />
            </OrderCollapsibleSection>
          ) : null}
        </div>

        <div className="stack-section">
          <OrderRecordCard title="Customer">
            <OrderCustomerFacts customerId={order.customer_id ?? null} />
          </OrderRecordCard>

          {buyerNote ? (
            <OrderRecordCard title="Buyer note" description="Left by the buyer at checkout.">
              <p className="whitespace-pre-line break-words text-role-caption font-medium text-text-default">
                {buyerNote}
              </p>
            </OrderRecordCard>
          ) : null}

          {hasOrderRow ? <OrderReturnsCard orderId={orderRowId} /> : null}

          <OrderRecordCard title="Warranty">
            <OrderWarrantySummary order={order} />
          </OrderRecordCard>
        </div>
      </div>
    </div>
  );
}
