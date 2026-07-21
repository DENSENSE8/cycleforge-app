'use client';

/**
 * Search order-detail Overview — a Shopify-style two-column snapshot (default
 * tab). The wide main column leads with what matters most: packing photos →
 * shipping → product (last). The narrow side column carries order meta + dates.
 * Packing photos reuse the already-built `PhotoGallery` (fullscreen viewer);
 * deep tabs keep the full per-facet detail.
 */

import { useOrderChannelLabel } from '@/hooks/useCatalog';
import { conditionLabel } from '@/lib/conditions';
import type { ShippedOrder } from '@/types/orders';
import { formatDateTimePST } from '@/utils/date';
import { PhotoGallery, type PhotoGalleryInput } from '@/components/shipped/PhotoGallery';
import {
  SearchOrderCard,
  SearchOrderFactList,
  SearchOrderFactRow,
} from '@/components/dashboard/search/SearchOrderTabFrame';

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const t = String(v ?? '').trim();
    if (t) return t;
  }
  return '';
}

export function SearchOrderOverviewTab({ order }: { order: ShippedOrder }) {
  const orderChannelLabel = useOrderChannelLabel();
  const platform = orderChannelLabel(order.order_id || '', order.account_source);
  const tracking = firstNonEmpty(
    order.shipping_tracking_number,
    ...(order.tracking_numbers ?? []),
  );
  const condition = order.condition ? conditionLabel(order.condition, 'table') : '';
  const status = firstNonEmpty(
    order.latest_status_label,
    order.shipment_status,
    order.is_delivered ? 'Delivered' : '',
    order.is_shipped ? 'Shipped' : '',
    'Open',
  );
  const sale =
    order.sale_amount != null && order.sale_amount !== ''
      ? `${order.currency ? `${order.currency} ` : ''}${order.sale_amount}`
      : '';

  const photos = (order.packer_photos_url ?? []) as PhotoGalleryInput[];
  const hasPhotos = Array.isArray(photos) && photos.length > 0;

  return (
    <div>
      {/* Identity (order # · title · chips) lives in the top bookmark; Overview
          leads straight into the two-column snapshot. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column — importance order: photos → shipping → product */}
        <div className="stack-section lg:col-span-2">
            <SearchOrderCard
              title="Packing photos"
              description="Proof of packout for this order."
            >
              {hasPhotos ? (
                <PhotoGallery
                  photos={photos}
                  orderId={order.order_id}
                  launcherLayout="thumbnails"
                />
              ) : (
                <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center">
                  <p className="text-role-caption font-semibold text-text-muted">
                    No packing photos
                  </p>
                  <p className="mt-1 text-role-micro font-medium text-text-faint">
                    Photos appear here once the packer captures the packout.
                  </p>
                </div>
              )}
            </SearchOrderCard>

            <SearchOrderCard title="Shipping" description="Carrier, tracking, and ship-out.">
              <SearchOrderFactList>
                <SearchOrderFactRow label="Tracking" value={tracking} mono span />
                <SearchOrderFactRow label="Carrier" value={order.carrier} />
                <SearchOrderFactRow label="Shipment status" value={order.shipment_status} />
                <SearchOrderFactRow label="Latest status" value={order.latest_status_label} />
                <SearchOrderFactRow
                  label="Latest event"
                  value={order.latest_event_at ? formatDateTimePST(order.latest_event_at) : ''}
                />
                <SearchOrderFactRow
                  label="Ship confirmed"
                  value={
                    order.ship_confirmed_at ? formatDateTimePST(order.ship_confirmed_at) : ''
                  }
                />
              </SearchOrderFactList>
            </SearchOrderCard>

            <SearchOrderCard title="Product" description="Catalog and unit identity.">
              <SearchOrderFactList>
                <SearchOrderFactRow label="Title" value={order.product_title} span />
                <SearchOrderFactRow label="SKU" value={order.sku} mono />
                <SearchOrderFactRow label="Item #" value={order.item_number} mono />
                <SearchOrderFactRow label="Condition" value={condition} />
                <SearchOrderFactRow label="Serial" value={order.serial_number} mono />
                <SearchOrderFactRow label="Quantity" value={order.quantity} />
                <SearchOrderFactRow label="Sale amount" value={sale} />
              </SearchOrderFactList>
            </SearchOrderCard>
          </div>

          {/* Side column — order meta + handling */}
          <div className="stack-section">
            <SearchOrderCard title="Order">
              <SearchOrderFactList cols={1}>
                <SearchOrderFactRow label="Order #" value={order.order_id} mono />
                <SearchOrderFactRow label="Platform" value={platform} />
                <SearchOrderFactRow label="Status" value={status} />
                <SearchOrderFactRow label="Condition" value={condition} />
                <SearchOrderFactRow label="Sale amount" value={sale} />
              </SearchOrderFactList>
            </SearchOrderCard>

            <SearchOrderCard title="Dates & handling">
              <SearchOrderFactList cols={1}>
                <SearchOrderFactRow
                  label="Created"
                  value={order.created_at ? formatDateTimePST(order.created_at) : ''}
                />
                <SearchOrderFactRow
                  label="Ship by"
                  value={order.ship_by_date ? formatDateTimePST(order.ship_by_date) : ''}
                />
                <SearchOrderFactRow
                  label="Packed at"
                  value={order.packed_at ? formatDateTimePST(order.packed_at) : ''}
                />
                <SearchOrderFactRow label="Packed by" value={order.packed_by_name} />
              </SearchOrderFactList>
            </SearchOrderCard>
          </div>
        </div>
    </div>
  );
}
