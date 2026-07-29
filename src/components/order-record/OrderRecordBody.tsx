'use client';

/**
 * OrderRecordBody — the single-scroll order record (Week 1, D2/D3).
 *
 * Replaces the eight-tab strip on the order-record surfaces with one vertical
 * scroll: a main column carrying the transaction payload and its history, and a
 * right rail carrying dimensional metadata (buyer, ship-to, buyer note, links).
 * Operators scan vertically; tabs hid exception state behind a click.
 *
 * SCOPE (D2a) — this body is for ORDER-RECORD surfaces only:
 *   `/o/[orderId]` · Dashboard Search detail · `DashboardOrderDetails`.
 * The other seven `ShippedDetailsBody` contexts (station, packer, fulfillment,
 * labels, staged, shipped, queue) stay on the legacy tabbed body — several are
 * Station-contract at `floor` density, where a Workbench master-detail layout
 * is the wrong shape. They need a Station-density variant designed on their own
 * terms, not this retrofitted.
 *
 * This is a LAYOUT COMPOSER. Every section is an existing component
 * (`CustomerDetailsTab`, `OrderTimelineSection`, `SerialJourneySection`,
 * `OrderDocumentsSection`, `OrderWarrantySection`, `PhotoGallery`) arranged into
 * the two columns — it does not re-implement any of them.
 *
 * Presence-driven: a card that has no data does not render. Empty teaching
 * states belong to the sections that own the fetch, not to this shell.
 */

import type { ReactNode } from 'react';
import { AlertTriangle, Package, Zap } from '@/components/Icons';
import { Button, Panel } from '@/design-system/primitives';
import { ThreadPanel } from '@/components/threads/ThreadPanel';
import {
  OrderFactList,
  OrderFactRow,
  OrderRecordCard,
} from '@/components/order-record/order-record-card';
import { OrderReturnsCard } from '@/components/order-record/OrderReturnsCard';
import {
  isSearchOrderFactEmpty,
  isShipByBeforeCreated,
} from '@/components/order-record/order-fact-presence';
import { CustomerDetailsTab } from '@/components/shipped/CustomerDetailsTab';
import { ShippingInformationSection } from '@/components/shipped/details-panel/ShippingInformationSection';
import { ProductDetailsSection } from '@/components/shipped/details-panel/ProductDetailsSection';
import type { EditableShippingFields } from '@/components/shipped/details-panel/shipping-information/types';
import { OrderTimelineSection } from '@/components/shipped/OrderTimelineSection';
import { SerialJourneySection } from '@/components/serial/SerialJourneySection';
import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import { OrderWarrantySection } from '@/components/shipped/details-panel/OrderWarrantySection';
import { PhotoGallery, type PhotoGalleryInput } from '@/components/shipped/PhotoGallery';
import type { ShippedOrder } from '@/types/orders';
import { formatDateTimePST } from '@/utils/date';
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
   * Editing passthroughs. Omit them and the record reads read-only; supply them
   * and Item/Fulfillment become the same inline editors the tabbed body had —
   * order #, item #, tracking, ship-by, condition, urgent, copy-all. The
   * single-scroll layout must not cost the surface a capability (D2).
   */
  editableShippingFields?: EditableShippingFields;
  copiedAll?: boolean;
  onCopyAll?: () => void;
  onUpdate?: () => void;
  /**
   * Opens the work-order assignment card. In the tabbed body this hung off the
   * detail-stack action bar, which the single scroll does not have — it becomes
   * a card action on Fulfillment. Omitted → the control hides.
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
        'flex items-start gap-2 rounded-xl border px-4 py-3',
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

  // ── Derived facts ────────────────────────────────────────────────────────
  const tracking = firstNonEmpty(order.shipping_tracking_number, ...(order.tracking_numbers ?? []));
  const sale =
    order.sale_amount != null && order.sale_amount !== ''
      ? `${order.currency ? `${order.currency} ` : ''}${order.sale_amount}`
      : '';

  const photos = (order.packer_photos_url ?? []) as PhotoGalleryInput[];
  const hasPhotos = Array.isArray(photos) && photos.length > 0;

  const created = order.created_at ? formatDateTimePST(order.created_at) : '';
  const shipBy = order.ship_by_date ? formatDateTimePST(order.ship_by_date) : '';
  const packedAt = order.packed_at ? formatDateTimePST(order.packed_at) : '';
  const latestEvent = order.latest_event_at ? formatDateTimePST(order.latest_event_at) : '';
  const shipConfirmed = order.ship_confirmed_at ? formatDateTimePST(order.ship_confirmed_at) : '';
  const shipByAnomaly = isShipByBeforeCreated(order.ship_by_date, order.created_at);

  const serials = [
    ...new Set(
      String(order.serial_number || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];

  // `is_urgent` / `is_out_of_stock` are real columns but not on the ShippedOrder
  // kernel yet — the legacy panel reads them the same way.
  const isUrgent = Boolean((order as { is_urgent?: unknown }).is_urgent);
  const isOutOfStock = Boolean((order as { is_out_of_stock?: unknown }).is_out_of_stock);

  const buyerNote = String(order.buyer_note ?? '').trim();

  const hasItem = anyPresent(order.product_title, order.sku, order.item_number, order.quantity, sale);
  const hasFulfillment = anyPresent(
    tracking,
    order.carrier,
    order.shipment_status,
    order.latest_status_label,
    latestEvent,
    shipConfirmed,
    shipBy,
    packedAt,
    order.packed_by_name,
  );
  const hasExceptions = isOutOfStock || isUrgent || shipByAnomaly;

  return (
    <div className="stack-section">
      {/* ── Exceptions ─────────────────────────────────────────────────── */}
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

      <div className={cn('grid grid-cols-1 gap-6', twoUp && 'lg:grid-cols-3')}>
        {/* ── Main column ──────────────────────────────────────────────── */}
        <div className={cn('stack-section', twoUp && 'lg:col-span-2')}>
          {/* Item + Fulfillment compose the existing editable sections rather
              than re-listing their fields read-only — that is what keeps order #
              / item # / tracking / ship-by / condition / urgent / copy-all
              working after the tab strip went away. */}
          {hasItem ? (
            <OrderRecordCard title="Item">
              <ProductDetailsSection
                shipped={order}
                editableShippingFields={editableShippingFields}
              />
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
              <ShippingInformationSection
                shipped={order}
                copiedAll={copiedAll}
                onCopyAll={onCopyAll}
                onUpdate={onUpdate}
                editableShippingFields={editableShippingFields}
              />
              <OrderFactList>
                <OrderFactRow label="Carrier" value={order.carrier} omitWhenEmpty />
                <OrderFactRow label="Shipment status" value={order.shipment_status} omitWhenEmpty />
                <OrderFactRow label="Latest status" value={order.latest_status_label} omitWhenEmpty />
                <OrderFactRow label="Latest event" value={latestEvent} omitWhenEmpty />
                <OrderFactRow label="Ship confirmed" value={shipConfirmed} omitWhenEmpty />
                <OrderFactRow label="Created" value={created} omitWhenEmpty />
                <OrderFactRow label="Packed at" value={packedAt} omitWhenEmpty />
                <OrderFactRow label="Packed by" value={order.packed_by_name} omitWhenEmpty />
              </OrderFactList>
            </OrderRecordCard>
          ) : null}

          {/* Financials — D11: the section shell always renders. Until the
              commercial keyspace bridge lands (Week 4) there is no fee/payout
              data, so fall back to the operational sale amount and label the
              gap. Never blank, never a fabricated zero. */}
          <OrderRecordCard
            title="Financials"
            description="Fees and payout arrive with the linked commercial record."
          >
            <OrderFactList>
              <OrderFactRow label="Sale amount" value={sale} />
              <OrderFactRow label="Fees" value="" />
              <OrderFactRow label="Net payout" value="" />
            </OrderFactList>
            <p className="text-role-micro font-medium text-text-faint">
              Not reconciled — this order has no linked commercial document yet.
            </p>
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

          {hasOrderRow ? (
            <div className="stack-section">
              <OrderTimelineSection orderId={orderRowId} />
              {serials.map((sn) => (
                <SerialJourneySection
                  key={sn}
                  serialNumber={sn}
                  title={serials.length > 1 ? `Item Journey · ${sn}` : 'Item Journey'}
                />
              ))}
            </div>
          ) : null}

          {/* Chat needs a bounded height for its own message scroll + composer:
              the page lane scrolls, the thread manages its own. Without this the
              single scroll would have cost the record its Conversation tab. */}
          {hasOrderRow ? (
            <Panel padding="none" className="flex h-[70vh] min-h-[28rem] flex-col overflow-hidden">
              <div className="shrink-0 border-b border-border-hairline px-5 py-3">
                <h3 className="text-role-body font-semibold text-text-default">Conversation</h3>
                <p className="mt-0.5 text-role-micro font-medium text-text-muted">
                  Internal notes and linked support threads.
                </p>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <ThreadPanel entityType="ORDER" entityId={orderRowId} />
              </div>
            </Panel>
          ) : null}
        </div>

        {/* ── Right rail ───────────────────────────────────────────────── */}
        <div className="stack-section">
          <OrderRecordCard title="Customer">
            <CustomerDetailsTab customerId={order.customer_id ?? null} bare />
          </OrderRecordCard>

          {buyerNote ? (
            <OrderRecordCard title="Buyer note" description="Left by the buyer at checkout.">
              <p className="whitespace-pre-line break-words text-role-caption font-medium text-text-default">
                {buyerNote}
              </p>
            </OrderRecordCard>
          ) : null}

          <OrderRecordCard title="Order">
            <OrderFactList cols={1}>
              <OrderFactRow label="Order #" value={order.order_id} mono />
              <OrderFactRow label="Account source" value={order.account_source} omitWhenEmpty />
              <OrderFactRow label="Type" value={order.tracking_type} omitWhenEmpty />
            </OrderFactList>
          </OrderRecordCard>

          {hasOrderRow ? <OrderReturnsCard orderId={orderRowId} /> : null}

          <OrderRecordCard title="Warranty">
            <OrderWarrantySection order={order} />
          </OrderRecordCard>
        </div>
      </div>
    </div>
  );
}
