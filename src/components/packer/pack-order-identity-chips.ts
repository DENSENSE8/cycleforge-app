/** Pure chip mapping for Pack → {@link CartonContextCard}. */

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
