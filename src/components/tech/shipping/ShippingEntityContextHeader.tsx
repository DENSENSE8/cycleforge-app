'use client';

import { useEffect, useMemo, useState } from 'react';
import { CartonContextCard } from '@/components/station/entity-context';
import { getTrackingUrl } from '@/utils/order-links';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import { resolveShippingListingLinks } from './shipping-listing-links';

/**
 * Shipping adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 *
 * Maps an active outbound order onto the Unbox one-row station identity face
 * (listing · order# · tracking · classify). Claim / photos / lifecycle / PO$
 * are omitted — the ship session stays scan-driven. Classify is read-only.
 * Mount inside {@link StationContextBar}; pair host with `placement="flow"` +
 * `reserveIdentityClearance={false}`. Out-of-stock / sub-pending live in
 * StationMoreDetails corner chips — never a centre advisory strip.
 */
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

  const [listingLink, setListingLink] = useState(listingUrl ?? '');
  const [platformValue, setPlatformValue] = useState(platformKey);

  useEffect(() => {
    setListingLink(listingUrl ?? '');
    setPlatformValue(platformKey);
  }, [activeOrder.orderId, activeOrder.tracking, listingItemKey, listingUrl, platformKey]);

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
