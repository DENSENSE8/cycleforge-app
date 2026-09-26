'use client';

/** `ShippedOrder → CartonContextCard` adapter — the ONE station identity face for an order, shared by every {@link EntityStationPane} consumer. */

import { CartonContextCard } from '@/components/station/entity-context';
import { packListingIdentity } from '@/components/packer/pack-listing-identity';
import { displayPlatformSlugFromOrderId } from '@/lib/marketplace-order-id';
import { getTrackingUrl } from '@/utils/order-links';
import type { ShippedOrder } from '@/types/orders';

function orderSaleTotal(order: ShippedOrder): number | null {
  if (order.sale_amount == null || order.sale_amount === '') return null;
  const n = Number(order.sale_amount);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function OrderStationIdentity({
  order,
  onExitToList,
  exitLabel = 'Back to orders queue',
  onOpenPhotosDisplay,
}: {
  order: ShippedOrder;
  /** Identity ◁ — host must clear the focused order (same as Unbox Back to list). */
  onExitToList?: () => void;
  /** What ◁ returns to on this surface ("Back to results" on `/search`). */
  exitLabel?: string;
  onOpenPhotosDisplay?: () => void;
}) {
  const tracking = String(order.shipping_tracking_number || '').trim();
  const orderId = String(order.order_id || '').trim();
  // Unresolved order# is a DASH. Tracking has its own chip one cell over, so
  // falling back to it printed the same string twice and claimed an order#
  // the row never had. Same rule as `resolvePackOrderIdentityChips`.
  const poDisplay = orderId || '—';
  const listing = packListingIdentity(order.item_number || order.sku || orderId);
  const platformValue = displayPlatformSlugFromOrderId(
    orderId,
    order.account_source || listing.platformValue,
  );

  return (
    <CartonContextCard
      receivingId={null}
      staffId=""
      isUnmatched={false}
      showStaffPhotoRow
      classifyInteractive={false}
      photoStage="unbox_carton"
      poTotal={orderSaleTotal(order)}
      showPoTotal
      listingLink={listing.listingLink}
      listingOpenHref={listing.listingOpenHref}
      listingLinks={listing.listingLinks}
      poOpenHref={null}
      trackingOpenHref={tracking ? getTrackingUrl(tracking) : null}
      poDisplay={poDisplay}
      linkedOrderNumber={orderId || null}
      lineId={null}
      zendeskTrimmed=""
      zendeskHref={null}
      zendeskChipDisplay=""
      primaryTrackingTrimmed={tracking}
      filledExtraTrackingsCount={0}
      isLocalPickup={false}
      platformValue={platformValue}
      onPlatformSelect={() => {}}
      receivingType=""
      onTypeSelect={() => {}}
      onExitToList={onExitToList}
      exitLabel={exitLabel}
      onOpenPhotosDisplay={onOpenPhotosDisplay}
    />
  );
}
