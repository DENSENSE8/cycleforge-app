/** Listing identity for a pack session — the one place that turns an active pack order's SKU / item number into the listing link + platform… */

import type { CartonListingLink } from '@/lib/receiving/listing-links';
import {
  getExternalUrlByItemNumber,
  getPlatformKeyByItemNumber,
  getPlatformLabelByItemNumber,
} from '@/utils/external-item-url';

interface PackListingIdentity {
  /** Listing URL (copy value + open target); empty when no item number. */
  listingLink: string;
  listingOpenHref: string | null;
  /** `source-platform` catalog value — drives the chip's tone + label. */
  platformValue: string;
  /** Displays / chip multi-link face (derived storefront when present). */
  listingLinks: CartonListingLink[];
}

const EMPTY: PackListingIdentity = {
  listingLink: '',
  listingOpenHref: null,
  platformValue: '',
  listingLinks: [],
};

export function packListingIdentity(
  itemNumber: string | null | undefined,
): PackListingIdentity {
  const item = String(itemNumber || '').trim();
  if (!item) return EMPTY;
  const href = getExternalUrlByItemNumber(item);
  if (!href) return EMPTY;
  const key = getPlatformKeyByItemNumber(item);
  const platformLabel = getPlatformLabelByItemNumber(item);
  const label =
    platformLabel && platformLabel !== 'Unknown' ? platformLabel : 'Listing';
  return {
    listingLink: href,
    listingOpenHref: href,
    platformValue: key === 'amazon_fba' ? 'fba' : key,
    listingLinks: [{ href, label, source: 'derived' }],
  };
}
