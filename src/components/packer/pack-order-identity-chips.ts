/**
 * Pure chip mapping for Pack → {@link CartonContextCard}.
 *
 * Keeps order# in the PO/order slot and listing/platform from the item number —
 * never stuffs SKU into `poDisplay` (that was the pack identity fork).
 */

import { packListingIdentity } from '@/components/packer/pack-listing-identity';
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
    poDisplay: orderId || tracking || '—',
    listingLink: listing.listingLink,
    listingOpenHref: listing.listingOpenHref,
    platformValue: listing.platformValue,
    listingLinks: listing.listingLinks,
    canSendToPhone,
    packerLogId,
  };
}
