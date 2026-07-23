'use client';

/**
 * Search order-detail Overview — presence-driven snapshot (default tab).
 * Bookmark owns identity (order # · title · chips); Overview only mounts
 * facts/cards that have data. Packing photos appear when captured; empty
 * teaching states live on deep tabs, not here.
 */

import { AlertTriangle } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  isSearchOrderFactEmpty,
  isShipByBeforeCreated,
} from '@/components/dashboard/search/search-order-overview-presence';
import {
  SearchOrderCard,
  SearchOrderFactList,
  SearchOrderFactRow,
} from '@/components/dashboard/search/SearchOrderTabFrame';
import { PhotoGallery, type PhotoGalleryInput } from '@/components/shipped/PhotoGallery';
import type { ShippedOrder } from '@/types/orders';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import type { ReactNode } from 'react';

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

export function SearchOrderOverviewTab({ order }: { order: ShippedOrder }) {
  const tracking = firstNonEmpty(
    order.shipping_tracking_number,
    ...(order.tracking_numbers ?? []),
  );
  const sale =
    order.sale_amount != null && order.sale_amount !== ''
      ? `${order.currency ? `${order.currency} ` : ''}${order.sale_amount}`
      : '';

  const photos = (order.packer_photos_url ?? []) as PhotoGalleryInput[];
  const hasPhotos = Array.isArray(photos) && photos.length > 0;

  const latestEvent = order.latest_event_at ? formatDateTimePST(order.latest_event_at) : '';
  const shipConfirmed = order.ship_confirmed_at
    ? formatDateTimePST(order.ship_confirmed_at)
    : '';
  const created = order.created_at ? formatDateTimePST(order.created_at) : '';
  const shipByRaw = order.ship_by_date ? formatDateTimePST(order.ship_by_date) : '';
  const packedAt = order.packed_at ? formatDateTimePST(order.packed_at) : '';
  const shipByAnomaly = isShipByBeforeCreated(order.ship_by_date, order.created_at);

  const hasShipping = anyPresent(
    tracking,
    order.carrier,
    order.shipment_status,
    order.latest_status_label,
    latestEvent,
    shipConfirmed,
  );
  // Title / condition live in the bookmark — Overview only adds catalog deltas.
  const hasProduct = anyPresent(
    order.sku,
    order.item_number,
    order.serial_number,
    order.quantity,
    sale,
  );
  const hasDates = anyPresent(created, shipByRaw, packedAt, order.packed_by_name);
  const hasSide = hasDates;
  const hasMain = hasPhotos || hasShipping || hasProduct;

  if (!hasMain && !hasSide) {
    return (
      <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-8 text-center">
        <p className="text-role-caption font-semibold text-text-muted">No overview facts yet</p>
        <p className="mt-1 text-role-micro font-medium text-text-faint">
          Open a section tab for the full schema, or wait for packout / ship-out data.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-6',
        hasMain && hasSide && 'lg:grid-cols-3',
      )}
    >
      {hasMain ? (
        <div className={cn('stack-section', hasSide && 'lg:col-span-2')}>
          {hasPhotos ? (
            <SearchOrderCard title="Packing photos">
              <PhotoGallery
                photos={photos}
                orderId={order.order_id}
                launcherLayout="thumbnails"
              />
            </SearchOrderCard>
          ) : null}

          {hasShipping ? (
            <SearchOrderCard title="Shipping">
              <SearchOrderFactList>
                <SearchOrderFactRow label="Tracking" value={tracking} mono span omitWhenEmpty />
                <SearchOrderFactRow label="Carrier" value={order.carrier} omitWhenEmpty />
                <SearchOrderFactRow
                  label="Shipment status"
                  value={order.shipment_status}
                  omitWhenEmpty
                />
                <SearchOrderFactRow
                  label="Latest status"
                  value={order.latest_status_label}
                  omitWhenEmpty
                />
                <SearchOrderFactRow label="Latest event" value={latestEvent} omitWhenEmpty />
                <SearchOrderFactRow label="Ship confirmed" value={shipConfirmed} omitWhenEmpty />
              </SearchOrderFactList>
            </SearchOrderCard>
          ) : null}

          {hasProduct ? (
            <SearchOrderCard title="Product">
              <SearchOrderFactList>
                <SearchOrderFactRow label="SKU" value={order.sku} mono omitWhenEmpty />
                <SearchOrderFactRow label="Item #" value={order.item_number} mono omitWhenEmpty />
                <SearchOrderFactRow
                  label="Serial"
                  value={order.serial_number}
                  mono
                  omitWhenEmpty
                />
                <SearchOrderFactRow label="Quantity" value={order.quantity} omitWhenEmpty />
                <SearchOrderFactRow label="Sale amount" value={sale} omitWhenEmpty />
              </SearchOrderFactList>
            </SearchOrderCard>
          ) : null}
        </div>
      ) : null}

      {hasSide ? (
        <div className="stack-section">
          <SearchOrderCard title="Dates & handling">
            <SearchOrderFactList cols={1}>
              <SearchOrderFactRow label="Created" value={created} omitWhenEmpty />
              <SearchOrderFactRow
                label="Ship by"
                value={
                  shipByRaw ? (
                    shipByAnomaly ? (
                      <HoverTooltip label="Ship-by is before created — check marketplace clock / import.">
                        <span className="inline-flex items-center gap-1.5 text-text-warning">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {shipByRaw}
                        </span>
                      </HoverTooltip>
                    ) : (
                      shipByRaw
                    )
                  ) : (
                    ''
                  )
                }
                omitWhenEmpty
              />
              <SearchOrderFactRow label="Packed at" value={packedAt} omitWhenEmpty />
              <SearchOrderFactRow label="Packed by" value={order.packed_by_name} omitWhenEmpty />
            </SearchOrderFactList>
          </SearchOrderCard>
        </div>
      ) : null}
    </div>
  );
}
