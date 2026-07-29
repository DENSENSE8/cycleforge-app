/**
 * Listing identity for a pack session — the one place that turns an active pack
 * order's SKU / item number into the listing link + platform key the station
 * entity-context chips consume.
 *
 * Both packing surfaces read from here so the sidebar active-order card and the
 * workbench identity bar can never disagree about which listing an operator is
 * about to seal:
 *   - `StationPacking` (sidebar active-order card)
 *   - `PackOrderIdentity` → `CartonContextCard` (workbench identity bar)
 *
 * URL + label derivation stays in the `external-item-url` SoT; this only maps
 * its platform label onto the `source-platform` catalog value (`amazon_fba`
 * has no catalog row — it renders as `fba`).
 */

import {
  getExternalUrlByItemNumber,
  getPlatformKeyByItemNumber,
} from '@/utils/external-item-url';

interface PackListingIdentity {
  /** Listing URL (copy value + open target); empty when no item number. */
  listingLink: string;
  listingOpenHref: string | null;
  /** `source-platform` catalog value — drives the chip's tone + label. */
  platformValue: string;
}

const EMPTY: PackListingIdentity = {
  listingLink: '',
  listingOpenHref: null,
  platformValue: '',
};

export function packListingIdentity(
  itemNumber: string | null | undefined,
): PackListingIdentity {
  const item = String(itemNumber || '').trim();
  if (!item) return EMPTY;
  const href = getExternalUrlByItemNumber(item);
  if (!href) return EMPTY;
  const key = getPlatformKeyByItemNumber(item);
  return {
    listingLink: href,
    listingOpenHref: href,
    platformValue: key === 'amazon_fba' ? 'fba' : key,
  };
}
