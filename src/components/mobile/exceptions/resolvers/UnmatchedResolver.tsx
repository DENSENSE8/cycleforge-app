'use client';

/**
 * Unmatched scans — a pack or dock scan-out that matched no order. It is
 * worked on Fulfilled's unmatched view; the phone shows what was scanned and
 * opens that view.
 */

import { ScanBarcode } from '@/components/Icons';
import { DetailFact, DetailFacts, DetailNavRow } from '@/components/mobile/detail/DetailParts';
import type { UnmatchedScanExceptionFacts } from '@/lib/exceptions/facts';
import { shippedUnmatchedHref } from '@/lib/shipping/shipped-desk';
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
      <nav aria-label="Fulfilled unmatched scans">
        <DetailNavRow
          href={shippedUnmatchedHref()}
          title={row.resolveVerb}
          meta="Match it to its order, correct the number, or delete it"
          icon={<ScanBarcode />}
        />
      </nav>
    </>
  );
}
