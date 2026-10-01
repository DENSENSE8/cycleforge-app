'use client';

import { useId, useState } from 'react';
import { format } from 'date-fns';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EVIDENCE_CONTROL_CLASS } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { useResolveTrackingException } from '@/hooks/exceptions';
import type { TrackingExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { cn } from '@/utils/_cn';
import { resolveWith } from './resolve-feedback';

function when(iso: string | null): string {
  if (!iso) return '—';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '—' : format(at, 'MMM d, yyyy · h:mm a');
}

/**
 * Tracking — a scan that did not resolve to a Zoho PO. In place: re-query
 * Zoho with the tracking number, correct a mistyped number (which re-queries
 * on save), or close it as resolved / discarded with a note.
 */
export function TrackingResolver({ row, facts }: { row: ExceptionRow; facts: TrackingExceptionFacts }) {
  const { exception } = facts;
  const resolve = useResolveTrackingException();
  const fieldId = useId();
  const [tracking, setTracking] = useState(exception.trackingNumber);
  const [notes, setNotes] = useState(exception.notes ?? '');
  const pending = (action: 'refresh' | 'update') => resolve.isPending && resolve.variables?.action === action;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-tracking">
      <RecordGroup
        title="Scan"
        action={
          <Button
            variant="ghost"
            size="sm"
            loading={pending('refresh')}
            disabled={resolve.isPending}
            onClick={() => resolveWith(resolve, { action: 'refresh', id: exception.id }, `Re-checked ${exception.trackingNumber} with Zoho`)}
            data-testid="exception-tracking-refresh"
          >
            Re-check Zoho
          </Button>
        }
      >
        <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
          <EvidenceFactRow label="Tracking">
            <span className={cn(RECORD_ID_CLASS, 'select-all')}>{exception.trackingNumber}</span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Reason">{exception.exceptionReason ?? '—'}</EvidenceFactRow>
          <EvidenceFactRow label="Scanned">
            {when(exception.createdAt)}
            {exception.staffName ? ` · ${exception.staffName}` : ''}
            {exception.sourceStation ? ` · ${exception.sourceStation}` : ''}
          </EvidenceFactRow>
          <EvidenceFactRow label="Zoho checks">
            {exception.zohoCheckCount}× · last {when(exception.lastZohoCheckAt)}
          </EvidenceFactRow>
          {exception.lastError ? <EvidenceFactRow label="Last error" wide>{exception.lastError}</EvidenceFactRow> : null}
        </div>
      </RecordGroup>
      <RecordGroup title="Resolve">
        <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
          <label htmlFor={`${fieldId}-tracking`} className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
            Tracking number
          </label>
          <input
            id={`${fieldId}-tracking`}
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
            className={cn(EVIDENCE_CONTROL_CLASS, RECORD_ID_CLASS, 'w-full')}
            data-testid="exception-tracking-number"
          />
          <label htmlFor={`${fieldId}-notes`} className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
            Note
          </label>
          <input
            id={`${fieldId}-notes`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What happened to this scan"
            className={cn(EVIDENCE_CONTROL_CLASS, 'w-full')}
            data-testid="exception-tracking-notes"
          />
          <div className="flex flex-wrap justify-end gap-2">
            {tracking.trim() && tracking.trim() !== exception.trackingNumber ? (
              <Button
                variant="secondary"
                loading={pending('update')}
                disabled={resolve.isPending}
                onClick={() =>
                  resolveWith(
                    resolve,
                    { action: 'update', id: exception.id, patch: { tracking_number: tracking.trim(), notes: notes.trim() || null } },
                    `Tracking corrected to ${tracking.trim()}`,
                  )
                }
                data-testid="exception-tracking-save"
              >
                Save number
              </Button>
            ) : null}
            <Button
              variant="ghost"
              disabled={resolve.isPending}
              onClick={() =>
                resolveWith(
                  resolve,
                  { action: 'update', id: exception.id, patch: { status: 'discarded', notes: notes.trim() || null }, clears: row.key },
                  `${exception.trackingNumber} discarded`,
                )
              }
              data-testid="exception-tracking-discard"
            >
              Discard
            </Button>
            <Button
              variant="primary"
              loading={pending('update')}
              disabled={resolve.isPending}
              onClick={() =>
                resolveWith(
                  resolve,
                  { action: 'update', id: exception.id, patch: { status: 'resolved', notes: notes.trim() || null }, clears: row.key },
                  `${exception.trackingNumber} resolved`,
                )
              }
              data-testid="exception-resolve-tracking"
            >
              Mark resolved
            </Button>
          </div>
        </div>
      </RecordGroup>
    </div>
  );
}
