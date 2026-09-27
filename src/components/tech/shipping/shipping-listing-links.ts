/** Ready-to-Pack / Shipping listing face — same item-number → storefront URL SoT the identity chip uses ({@link getExternalUrlByItemNumber}). */

import type { ActiveStationOrder } from '@/hooks/useDeskPickController';
import type { CartonListingLink } from '@/lib/receiving/listing-links';
import { isEmptyDisplayValue } from '@/utils/empty-display-value';
import {
  getExternalUrlByItemNumber,
  getPlatformKeyByItemNumber,
  getPlatformLabelByItemNumber,
} from '@/utils/external-item-url';

interface ShippingListingResolution {
  listingItemKey: string;
  listingUrl: string | null;
  listingPlatformLabel: string | null;
  platformKey: string;
  listingLinks: CartonListingLink[];
}

export function resolveShippingListingLinks(
  activeOrder: Pick<ActiveStationOrder, 'itemNumber' | 'sku'>,
): ShippingListingResolution {
  const itemNumberRaw = String(activeOrder.itemNumber || '').trim();
  const itemNumberValue = isEmptyDisplayValue(activeOrder.itemNumber) ? '' : itemNumberRaw;
  const listingItemKey = itemNumberValue || String(activeOrder.sku || '').trim();
  const listingUrl = getExternalUrlByItemNumber(listingItemKey);
  const listingPlatformLabel = listingItemKey
    ? getPlatformLabelByItemNumber(listingItemKey)
    : null;
  const platformKey = listingItemKey ? getPlatformKeyByItemNumber(listingItemKey) : '';

  const listingLinks: CartonListingLink[] = listingUrl
    ? [
        {
          href: listingUrl,
          label:
            listingPlatformLabel && listingPlatformLabel !== 'Unknown'
              ? listingPlatformLabel
              : 'Listing',
          source: 'derived',
        },
      ]
    : [];

  return {
    listingItemKey,
    listingUrl,
    listingPlatformLabel,
    platformKey,
    listingLinks,
  };
}
