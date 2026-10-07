'use client';

/**
 * The external-link button that opens a SKU's listing on the platform
 * (operator 2026-10-06: check it, confirm it, then pair). The link is the
 * server's `resolveListingLink` answer — stored `listing_url`, else built from
 * the item number. With no link the button is hidden and a quiet "No listing
 * link" says why on hover.
 */

import { ExternalLinkActionIcon } from '@/design-system/components/ExternalLinkActionIcon';
import { cn } from '@/utils/_cn';
import { listingChipDisplay, storefrontName, type ListingLink } from '@/utils/external-item-url';

export function ListingLinkButton({ listing, subject, className }: { listing: ListingLink; subject: string; className?: string }) {
  if (!listing.href) {
    return (
      <span className={cn('shrink-0 text-role-micro text-text-faint', className)} title={listing.missing ?? undefined} data-testid="listing-link-missing">
        No listing link
      </span>
    );
  }
  const where = storefrontName(listing.storefront) ?? listingChipDisplay(listing.href);
  return (
    <ExternalLinkActionIcon
      href={listing.href}
      radius="control"
      className={cn('shrink-0', className)}
      ariaLabel={`Open the ${where} listing of ${subject}`}
      title={`Open the ${where} listing — ${listing.source === 'stored' ? 'stored link' : 'built from the item number'} (${listingChipDisplay(listing.href)})`}
    />
  );
}
