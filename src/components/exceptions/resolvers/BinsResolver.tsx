'use client';

import { useId, useState } from 'react';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EVIDENCE_CONTROL_CLASS } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { useResolveBinsException } from '@/hooks/exceptions';
import type { BinsExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { cn } from '@/utils/_cn';
import { resolveWith } from './resolve-feedback';

/** Bin errors — an open drift alert, acknowledged in place with what was found. */
export function BinsResolver({ row, facts }: { row: ExceptionRow; facts: BinsExceptionFacts }) {
  const { alert } = facts;
  const resolve = useResolveBinsException();
  const noteId = useId();
  const [note, setNote] = useState('');

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-bins">
      <RecordGroup title="Drift">
        <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
          <EvidenceFactRow label="SKU">
            <span className={cn(RECORD_ID_CLASS, 'select-all')}>{alert.sku}</span>
          </EvidenceFactRow>
          {alert.productTitle ? <EvidenceFactRow label="Item">{alert.productTitle}</EvidenceFactRow> : null}
          <EvidenceFactRow label="Bin">
            <span className={cn(RECORD_ID_CLASS, !alert.binBarcode && 'text-mode-warn')}>{alert.binBarcode ?? 'No bin'}</span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Drift">{alert.qtyAtTrigger ?? '—'}</EvidenceFactRow>
          {alert.notes ? <EvidenceFactRow label="Check" wide>{alert.notes}</EvidenceFactRow> : null}
        </div>
      </RecordGroup>
      <RecordGroup title="Resolve">
        <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
          <label htmlFor={noteId} className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
            What you found (optional)
          </label>
          <input
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Recounted — 2 were in the next bin"
            className={cn(EVIDENCE_CONTROL_CLASS, 'w-full')}
            data-testid="exception-bins-note"
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              loading={resolve.isPending}
              onClick={() =>
                resolveWith(resolve, { alertId: alert.id, note: note.trim() || undefined, clears: row.key }, `Drift on ${alert.binBarcode ?? alert.sku} acknowledged`)
              }
              data-testid="exception-resolve-bins"
            >
              {row.resolveVerb}
            </Button>
          </div>
        </div>
      </RecordGroup>
    </div>
  );
}
