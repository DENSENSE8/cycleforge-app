'use client';

/**
 * Unmatched scans — a pack or dock scan-out that matched no order. It is
 * worked on its package's record on Fulfilled (`?shipment=`); the phone shows
 * what was scanned and opens that package. No known package, no door.
 */

import { ScanBarcode } from '@/components/Icons';
import { DetailFact, DetailFacts, DetailNavRow } from '@/components/mobile/detail/DetailParts';
import type { UnmatchedScanExceptionFacts } from '@/lib/exceptions/facts';
import { fulfilledShipmentHref } from '@/lib/shipping/shipped-desk';
import { formatMonthDayTimePST } from '@/utils/date';
import type { PhoneResolverProps } from './resolver-props';

export function UnmatchedResolver({ row, facts }: PhoneResolverProps<UnmatchedScanExceptionFacts>) {
  const { scan } = facts;
  return (
    <>
      <DetailFacts label="Unmatched scan">
        <DetailFact label="Tracking" value={scan.tracking || null} mono copy={scan.tracking || undefined} />
        <DetailFact label="Station" value={row.tag.label} hint={scan.staffName} />
        {scan.createdAt ? <DetailFact label="Scanned" value={formatMonthDayTimePST(scan.createdAt)} /> : null}
        <DetailFact label="Note" value={scan.notes} />
      </DetailFacts>
      {scan.shipmentId != null ? (
        <nav aria-label="Fulfilled package">
          <DetailNavRow
            href={fulfilledShipmentHref(scan.shipmentId)}
            title={row.resolveVerb}
            meta="Link it to an order, or close it"
            icon={<ScanBarcode />}
          />
        </nav>
      ) : null}
    </>
  );
}
