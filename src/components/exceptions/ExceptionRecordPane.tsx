'use client';

import type { ReactNode } from 'react';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { ExceptionRequestError, useException } from '@/hooks/exceptions';
import type { ExceptionRecordResponse } from '@/lib/exceptions/facts';
import { ExceptionFactsGroup } from './ExceptionFactsGroup';
import { BinsResolver } from './resolvers/BinsResolver';
import { ClaimResolver } from './resolvers/ClaimResolver';
import { FbmResolver } from './resolvers/FbmResolver';
import { LabelsResolver } from './resolvers/LabelsResolver';
import { PairsResolver } from './resolvers/PairsResolver';
import { PaperworkResolver } from './resolvers/PaperworkResolver';
import { ShortResolver } from './resolvers/ShortResolver';
import { TrackingResolver } from './resolvers/TrackingResolver';
import { UnfoundResolver } from './resolvers/UnfoundResolver';

/**
 * The open exception: left, its ONE resolver (per kind, in place — no
 * resolver navigates away); right, what made it an exception. A resolved
 * exception leaves the list and its record says so.
 */
export function ExceptionRecordPane({ recordKey }: { recordKey: string }) {
  const record = useException(recordKey);
  if (record.isLoading) {
    return (
      <div className="flex-1 bg-mode-canvas p-4 text-mode-ink" aria-busy>
        <DeskRecordLayout main={<EvidenceNotice>Loading the exception…</EvidenceNotice>} />
      </div>
    );
  }
  // A resolve refetches the record: its 404 is the answer even while the last good read is still cached.
  const resolved = record.error instanceof ExceptionRequestError && record.error.status === 404;
  if (!record.data || resolved) {
    return (
      <div className="flex-1 bg-mode-canvas p-4 text-mode-ink" data-testid="exception-record-gone">
        <DeskRecordLayout
          main={
            <EvidenceNotice>
              {record.error instanceof Error && !/404|not found/i.test(record.error.message)
                ? record.error.message
                : 'Resolved — this is no longer an exception.'}
            </EvidenceNotice>
          }
        />
      </div>
    );
  }
  return (
    <div className="flex-1 bg-mode-canvas p-4 text-mode-ink" data-testid="exception-record" data-exception-kind={record.data.row.kind}>
      <DeskRecordLayout main={resolverFor(record.data)} aside={<ExceptionFactsGroup record={record.data} />} />
    </div>
  );
}

/** One resolver per kind; `facts.kind` narrows the payload each one reads. */
function resolverFor(record: ExceptionRecordResponse): ReactNode {
  const { row, facts } = record;
  switch (facts.kind) {
    case 'fbm':
      return <FbmResolver row={row} facts={facts} />;
    case 'pairs':
      return <PairsResolver row={row} facts={facts} />;
    case 'paperwork':
      return <PaperworkResolver row={row} facts={facts} />;
    case 'labels':
      return <LabelsResolver row={row} facts={facts} />;
    case 'bins':
      return <BinsResolver row={row} facts={facts} />;
    case 'tracking':
      return <TrackingResolver row={row} facts={facts} />;
    case 'claim':
      return <ClaimResolver row={row} facts={facts} />;
    case 'short':
      return <ShortResolver row={row} facts={facts} />;
    case 'unfound':
      return <UnfoundResolver row={row} facts={facts} />;
  }
}
