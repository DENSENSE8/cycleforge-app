/**
 * Pure chip mapping for Pack → {@link CartonContextCard}.
 *
 * Keeps order# in the PO/order slot and listing/platform from the item number —
 * never stuffs SKU into `poDisplay` (that was the pack identity fork).
 *
 * An unresolved order is a DASH, never the tracking number. Tracking has its own
 * chip one cell over, so falling back to it printed the same string twice and
 * told the packer they had an order# when the scan never resolved one. Empty
 * order# → `—`; the tracking chip still carries `chips.tracking`.
 */

import { packListingIdentity } from '@/components/packer/pack-listing-identity';
import { displayPlatformSlugFromOrderId } from '@/lib/marketplace-order-id';
import type { PackActiveOrderPane } from '@/components/packer/usePackerOrderPane';

export function resolvePackOrderIdentityChips(activeOrder: PackActiveOrderPane) {
  const tracking = String(activeOrder.tracking || '').trim();
  const orderId = String(activeOrder.orderId || '').trim();
  const sku = String(activeOrder.sku || '').trim();
  const listing = packListingIdentity(sku || orderId);
  const packerLogId = Number(activeOrder.packerLogId);
  const canSendToPhone = Number.isFinite(packerLogId) && packerLogId > 0;

  return {
    tracking,
    orderId,
    poDisplay: orderId || '—',
    listingLink: listing.listingLink,
    listingOpenHref: listing.listingOpenHref,
    platformValue: displayPlatformSlugFromOrderId(orderId, listing.platformValue),
    listingLinks: listing.listingLinks,
    canSendToPhone,
    packerLogId,
  };
}
