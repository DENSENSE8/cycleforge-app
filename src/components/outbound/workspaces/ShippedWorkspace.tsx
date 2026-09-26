'use client';

/**
 * Shipped desk body — the package archive, mounted under the shared desk
 * chrome at `/shipping/shipped`.
 *
 * The whole desk is {@link ShippedLedger}: the industrial record ledger over
 * the packer-log week feed, one record per PACKAGE (carrier tracking number),
 * the open package's record placed by `DeskRecordPlane` — in place of the list
 * by default, beside it when the staffer turns fullscreen on. The open key is
 * `?shipment=<id>`; the feed's filter params (`resolveShippedQueryArgs`,
 * `shipped_saved_views`) are untouched, so an old `?shipped=&carrier=UPS`
 * bookmark redirects here and reads identically.
 *
 * Packed history lives here too: `?ostatus=PACKED_STAGED` narrows the feed to
 * the staged lane through the outbound-state facet. `/shipping/orders?packed=`
 * stays a STAGE facet on open work, not an archive.
 */

import { ShippedLedger } from '@/components/shipped/ledger/ShippedLedger';

export function ShippedWorkspace() {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <ShippedLedger />
    </div>
  );
}
