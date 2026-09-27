'use client';

import { useEffect, useMemo, useState } from 'react';
import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import type { ActiveStationOrder } from '@/hooks/useDeskPickController';
import { displayPlatformSlugFromOrderId } from '@/lib/marketplace-order-id';
import { resolveShippingListingLinks } from './shipping-listing-links';

/** Shipping adapter for the station entity-context header SoT (`CartonContextCard` via `@/components/station/entity-context`). */
export function ShippingEntityContextHeader({
  activeOrder,
  onExitToList,
}: {
  activeOrder: ActiveStationOrder;
  /** Identity ◁ — host must clear the scan-controller order, not overlay-only. */
  onExitToList: () => void;
}) {
  const tracking = String(activeOrder.tracking || '').trim();
  const orderId = String(activeOrder.orderId || '').trim();

  const { listingItemKey, listingUrl, platformKey, listingLinks } = useMemo(
    () => resolveShippingListingLinks(activeOrder),
    [activeOrder.itemNumber, activeOrder.sku],
  );

  const resolvedPlatform = displayPlatformSlugFromOrderId(orderId, platformKey);
  const [listingLink, setListingLink] = useState(listingUrl ?? '');
  const [platformValue, setPlatformValue] = useState(resolvedPlatform);

  useEffect(() => {
    setListingLink(listingUrl ?? '');
    setPlatformValue(resolvedPlatform);
  }, [activeOrder.orderId, activeOrder.tracking, listingItemKey, listingUrl, resolvedPlatform]);

  return (
    <CartonContextCard
      receivingId={null}
      staffId=""
      isUnmatched={false}
      showStaffPhotoRow
      classifyInteractive={false}
      // Inert: no receiving photos. Required prop, no meaningful default.
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
      onPlatformSelect={() => {}}
      receivingType=""
      onTypeSelect={() => {}}
      onExitToList={onExitToList}
    />
  );
}
