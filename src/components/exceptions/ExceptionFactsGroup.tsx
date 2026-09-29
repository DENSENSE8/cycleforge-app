'use client';

import { format } from 'date-fns';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import type { ExceptionRecordResponse } from '@/lib/exceptions/facts';
import { EXCEPTION_DOMAIN_LABEL, EXCEPTION_KIND_SPEC } from '@/lib/exceptions/types';
import { cn } from '@/utils/_cn';
import { exceptionStateFace } from './exception-face';

/** The record's right column: WHY this is an exception — the tag, the rule that put it here, the evidence. */
export function ExceptionFactsGroup({ record }: { record: ExceptionRecordResponse }) {
  const { row } = record;
  const spec = EXCEPTION_KIND_SPEC[row.kind];
  const raised = row.raisedAt ? new Date(row.raisedAt) : null;
  return (
    <div className="flex min-w-0 flex-col gap-4 industrial:gap-0">
      <RecordGroup title="Why it is here" testId="exception-record-why">
        <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
          <EvidenceFactRow label="Exception">
            <LifecycleCode state={exceptionStateFace(row)} srLabel={null}>
              {row.tag.label}
            </LifecycleCode>
          </EvidenceFactRow>
          <EvidenceFactRow label="Kind">
            {EXCEPTION_DOMAIN_LABEL[spec.domain]} · {spec.label}
          </EvidenceFactRow>
          <EvidenceFactRow label="Blocked">
            <span className={cn(RECORD_ID_CLASS, 'select-all')}>{row.entity.label}</span>
          </EvidenceFactRow>
          {row.detail ? <EvidenceFactRow label="Evidence" wide>{row.detail}</EvidenceFactRow> : null}
          <EvidenceFactRow label="Raised">
            {raised && !Number.isNaN(raised.getTime()) ? format(raised, 'MMM d, yyyy · h:mm a') : '—'}
          </EvidenceFactRow>
          <EvidenceFactRow label="Rule" wide>
            <span className="text-mode-muted">{spec.membership}</span>
          </EvidenceFactRow>
        </div>
      </RecordGroup>
    </div>
  );
}
