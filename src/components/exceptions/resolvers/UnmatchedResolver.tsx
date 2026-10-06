'use client';

import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import type { UnmatchedScanExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { fulfilledShipmentHref } from '@/lib/shipping/shipped-desk';
import { cn } from '@/utils/_cn';

function when(iso: string): string {
  const at = new Date(iso);
  return iso && !Number.isNaN(at.getTime()) ? format(at, 'MMM d, yyyy · h:mm a') : '—';
}

/**
 * Unmatched scans — a pack or dock scan-out that matched no order. It is
 * worked on its package's record on Fulfilled (`?shipment=`: match it to its
 * order line); this record says what was scanned and opens that package. A
 * scan with no known package has nothing to open there.
 */
export function UnmatchedResolver({ row, facts }: { row: ExceptionRow; facts: UnmatchedScanExceptionFacts }) {
  const router = useRouter();
  const { scan } = facts;
  const shipmentId = scan.shipmentId;
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-unmatched">
      <RecordGroup
        title="Scan"
        action={
          shipmentId != null ? (
            <Button variant="ghost" size="sm" onClick={() => router.push(fulfilledShipmentHref(shipmentId))} data-testid="exception-unmatched-open">
              {row.resolveVerb}
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
          <EvidenceFactRow label="Tracking">
            <span className={cn(RECORD_ID_CLASS, 'select-all')}>{scan.tracking || '—'}</span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Station">{row.tag.label}</EvidenceFactRow>
          <EvidenceFactRow label="Scanned">
            {when(scan.createdAt)}
            {scan.staffName ? ` · ${scan.staffName}` : ''}
          </EvidenceFactRow>
          {scan.notes ? <EvidenceFactRow label="Note" wide>{scan.notes}</EvidenceFactRow> : null}
        </div>
      </RecordGroup>
    </div>
  );
}
