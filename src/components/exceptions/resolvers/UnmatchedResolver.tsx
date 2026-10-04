'use client';

import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import type { UnmatchedScanExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { shippedUnmatchedHref } from '@/lib/shipping/shipped-desk';
import { cn } from '@/utils/_cn';

function when(iso: string): string {
  const at = new Date(iso);
  return iso && !Number.isNaN(at.getTime()) ? format(at, 'MMM d, yyyy · h:mm a') : '—';
}

/**
 * Unmatched scans — a pack or dock scan-out that matched no order. It is
 * worked on Fulfilled's unmatched view (match it to its order, correct the
 * number, or delete it); this record says what was scanned and opens that view.
 */
export function UnmatchedResolver({ row, facts }: { row: ExceptionRow; facts: UnmatchedScanExceptionFacts }) {
  const router = useRouter();
  const { scan } = facts;
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-unmatched">
      <RecordGroup
        title="Scan"
        action={
          <Button variant="ghost" size="sm" onClick={() => router.push(shippedUnmatchedHref())} data-testid="exception-unmatched-open">
            {row.resolveVerb}
          </Button>
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
