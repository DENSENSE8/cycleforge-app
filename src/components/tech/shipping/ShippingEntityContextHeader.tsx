'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from '@/components/Icons';
import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import { resolveShippingListingLinks } from './shipping-listing-links';

/**
 * Shipping adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 *
 * Maps an active outbound order onto the two-row station identity face
 * (listing · order# · tracking). Claim / photos / classify / lifecycle / PO$
 * are omitted — the ship session stays scan-driven. Mount inside
 * {@link StationContextBar}; pair host with `placement="flow"` +
 * `reserveIdentityClearance={false}`. Out-of-stock notices stay below the
 * bar via {@link ShippingOutOfStockNotice} (flush hairline band, no card).
 */
export function ShippingEntityContextHeader({
  activeOrder,
  onExitToList,
}: {
  activeOrder: ActiveStationOrder;
  onExitToList?: () => void;
}) {
  const tracking = String(activeOrder.tracking || '').trim();
  const orderId = String(activeOrder.orderId || '').trim();

  const { listingItemKey, listingUrl, platformKey, listingLinks } = useMemo(
    () => resolveShippingListingLinks(activeOrder),
    [activeOrder.itemNumber, activeOrder.sku],
  );

  const [listingLink, setListingLink] = useState(listingUrl ?? '');
  const [platformValue, setPlatformValue] = useState(platformKey);
  const [receivingType, setReceivingType] = useState('');

  useEffect(() => {
    setListingLink(listingUrl ?? '');
    setPlatformValue(platformKey);
  }, [activeOrder.orderId, activeOrder.tracking, listingItemKey, listingUrl, platformKey]);

  return (
    <CartonContextCard
      receivingId={null}
      staffId=""
      isUnmatched={false}
      showStaffPhotoRow={false}
      // Inert: receivingId is always null here, so the photo pill never
      // renders regardless of stage. Required prop, no meaningful default.
      photoStage="unbox_carton"
      listingLink={listingLink}
      listingOpenHref={listingUrl}
      listingLinks={listingLinks}
      poOpenHref={null}
      trackingOpenHref={tracking ? getTrackingUrl(tracking) : null}
      poDisplay={orderId}
      linkedOrderNumber={orderId}
      lineId={null}
      zendeskTrimmed=""
      zendeskHref={null}
      zendeskChipDisplay=""
      primaryTrackingTrimmed={tracking}
      filledExtraTrackingsCount={0}
      isLocalPickup={false}
      platformValue={platformValue}
      onPlatformSelect={setPlatformValue}
      receivingType={receivingType}
      onTypeSelect={setReceivingType}
      onExitToList={onExitToList}
    />
  );
}

/** Out-of-stock banner — mount below {@link StationContextBar}, not inside it. */
export function ShippingOutOfStockNotice({
  outOfStock,
  isOutOfStock,
}: {
  /** @deprecated Prefer isOutOfStock boolean. */
  outOfStock?: string | boolean | null;
  isOutOfStock?: boolean;
}) {
  const flagged =
    typeof isOutOfStock === 'boolean'
      ? isOutOfStock
      : typeof outOfStock === 'boolean'
        ? outOfStock
        : Boolean(String(outOfStock || '').trim());
  if (!flagged) return null;

  return (
    <div className="flex items-start gap-2.5 border-b border-red-200 bg-red-50 px-3 py-2.5">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
      <p className="min-w-0 flex-1 text-role-caption font-semibold leading-snug text-red-800">
        Out of stock
      </p>
    </div>
  );
}
