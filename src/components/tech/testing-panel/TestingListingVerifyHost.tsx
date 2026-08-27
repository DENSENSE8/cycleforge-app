'use client';

/**
 * Testing Displays → Listing — seller-claimed condition + listing URL.
 *
 * Reference for the QC walk. Claim stays on Ticket Displays.
 */

import { ExternalLink } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  resolveSellerClaimedCondition,
  type SellerClaimedCondition,
} from '@/lib/receiving/seller-claimed-condition';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { listingLinksForReceivingRow } from '@/lib/receiving/listing-links';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { cn } from '@/utils/_cn';

export function TestingListingVerifyHost({
  row,
  matchedOrderCondition,
  listingCondition,
  claimed,
}: {
  row: ReceivingLineRow;
  matchedOrderCondition?: string | null;
  listingCondition?: string | null;
  /** Pre-resolved claim; when omitted, resolved from the condition props. */
  claimed?: SellerClaimedCondition;
}) {
  const resolved =
    claimed ??
    resolveSellerClaimedCondition({
      matchedOrderCondition,
      listingCondition,
    });
  // Resolver, not the bare column: a Zoho PO carries its links in sync notes,
  // so a carton with four auction links and an empty `receiving_listing_url`
  // had no Open target here at all.
  const listingHref = listingLinksForReceivingRow(row)[0]?.href ?? '';

  return (
    <div
      className={cn(DISPLAYS_BODY_INSET, 'space-y-3 py-3')}
      data-testing-listing-verify
    >
      <section className="space-y-1">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Seller claimed
        </p>
        {resolved.label ? (
          <p className="text-role-body font-semibold text-text-default" data-testing-seller-claimed>
            {resolved.label}
            {resolved.source ? (
              <span className="ml-2 text-role-caption font-normal text-text-soft">
                ({resolved.source === 'order' ? 'sold as' : 'listing'})
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-role-caption text-text-soft">
            No seller-claimed condition on record — compare against the open listing.
          </p>
        )}
      </section>

      <section className="space-y-1">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Listing</p>
        {listingHref ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => window.open(listingHref, '_blank', 'noopener,noreferrer')}
          >
            Open listing
          </Button>
        ) : (
          <p className="text-role-caption text-text-soft">No listing URL on this carton.</p>
        )}
      </section>

      <p className="text-role-caption text-text-soft">
        Compare against the listing. Ticket Displays owns claim and seller follow-up.
      </p>
    </div>
  );
}
