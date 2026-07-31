'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from '@/components/Icons';
import { CartonContextCard } from '@/components/station/entity-context';
import { WorkspaceCard } from '@/design-system/components';
import { isEmptyDisplayValue } from '@/utils/empty-display-value';
import {
  getExternalUrlByItemNumber,
  getPlatformKeyByItemNumber,
  getPlatformLabelByItemNumber,
} from '@/utils/external-item-url';
import { getTrackingUrl } from '@/utils/order-links';
import type { ActiveStationOrder } from '@/hooks/useStationTestingController';
import type { CartonListingLink } from '@/lib/receiving/listing-links';

/**
 * Shipping adapter for the station entity-context header SoT
 * (`CartonContextCard` via `@/components/station/entity-context`).
 *
 * Maps an active outbound order onto the Unbox condensed identity row
 * (listing · order# · tracking). Claim / photos / classify are omitted —
 * the ship session stays scan-driven. Mount inside {@link StationContextBar}
 * with `density="bar"`. Out-of-stock notices stay below the bar via
 * {@link ShippingOutOfStockNotice}.
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

  const itemNumberRaw = String(activeOrder.itemNumber || '').trim();
  const itemNumberValue = isEmptyDisplayValue(activeOrder.itemNumber) ? '' : itemNumberRaw;
  const listingItemKey = itemNumberValue || String(activeOrder.sku || '').trim();
  const listingUrl = getExternalUrlByItemNumber(listingItemKey);
  const listingPlatformLabel = listingItemKey
    ? getPlatformLabelByItemNumber(listingItemKey)
    : null;
  const platformKey = listingItemKey ? getPlatformKeyByItemNumber(listingItemKey) : '';

  const listingLinks = useMemo<CartonListingLink[]>(() => {
    if (!listingUrl) return [];
    const label =
      listingPlatformLabel && listingPlatformLabel !== 'Unknown'
        ? listingPlatformLabel
        : 'Listing';
    return [{ href: listingUrl, label, source: 'derived' }];
  }, [listingUrl, listingPlatformLabel]);

  const [listingLink, setListingLink] = useState(listingUrl ?? '');
  const [platformValue, setPlatformValue] = useState(platformKey);
  const [receivingType, setReceivingType] = useState('');

  useEffect(() => {
    setListingLink(listingUrl ?? '');
    setPlatformValue(platformKey);
  }, [activeOrder.orderId, activeOrder.tracking, listingItemKey, listingUrl, platformKey]);

  return (
    <CartonContextCard
      density="bar"
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
    <WorkspaceCard label="Out of stock" tone="red" bodyClassName="px-5 py-3">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-red-800">
          Out of stock
        </p>
      </div>
    </WorkspaceCard>
  );
}
