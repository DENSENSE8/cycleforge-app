'use client';

/**
 * The record of one import run (L3): its steps — ShipStation, Google Sheets,
 * each channel, exceptions — and the orders that run touched, narrowed by the
 * same sidebar filters as the list it was opened from.
 */

import Link from 'next/link';
import { Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  EvidenceFact,
  EvidenceFacts,
  EvidenceNotice,
  EvidenceSection,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import type { OrderChannelResolver } from '@/lib/platform-display';
import { cn } from '@/utils/_cn';
import {
  IMPORTS_PATH,
  importDuration,
  importKindLabel,
  importRowLocator,
  importSourceLabel,
  importStamp,
  importStepCountsLine,
  importTriggerLabel,
} from '@/lib/imports/record-faces';
import { IMPORT_ROW_OUTCOME_LIFECYCLE } from '@/design-system/tokens/import-record-lifecycle';
import { useImportRows, useImportRun } from '@/lib/imports/record-client';
import { ImportFilledFields, ImportOrderNumber, ImportReviewDoor } from './import-record-parts';

export function ImportRunRecordView({
  runId,
  rowsQuery,
  channelOf,
  canReview,
}: {
  runId: number;
  /** `/api/imports/rows` query for this run: the sidebar's filters plus `run=<id>`. */
  rowsQuery: string;
  channelOf: OrderChannelResolver;
  canReview: boolean;
}) {
  const detail = useImportRun(runId);
  const rows = useImportRows(rowsQuery);
  const run = detail.data ?? null;

  if (detail.isPending) {
    return (
      <p className={cn(RECORD_LABEL_CLASS, 'flex items-center gap-2 px-4 py-6 text-mode-muted')}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading run {runId}…
      </p>
    );
  }
  if (!run) {
    return <EvidenceNotice tone="warn">{detail.error?.message ?? `Run ${runId} is not on file.`}</EvidenceNotice>;
  }

  return (
    <div className="flex min-h-0 flex-col" data-testid="import-run-record">
      {run.error ? <EvidenceNotice tone="warn">{run.error}</EvidenceNotice> : null}
      <EvidenceSection label="Totals">
        <EvidenceFacts>
          <EvidenceFact label="Inserted">{run.totals.inserted}</EvidenceFact>
          <EvidenceFact label="Backfilled">{run.totals.backfilled}</EvidenceFact>
          <EvidenceFact label="Tracking">{run.totals.trackingFilled}</EvidenceFact>
          <EvidenceFact label="To review">{run.totals.needsReview}</EvidenceFact>
          <EvidenceFact label="Skipped">{run.totals.skipped}</EvidenceFact>
          <EvidenceFact label="Failed">{run.totals.failed}</EvidenceFact>
          <EvidenceFact label="Duration">{importDuration(run.durationMs)}</EvidenceFact>
          <EvidenceFact label="Kind">{importKindLabel(run.kind)}</EvidenceFact>
          <EvidenceFact label="Trigger">{importTriggerLabel(run)}</EvidenceFact>
          <EvidenceFact label="Started">{importStamp(run.startedAt)} PT</EvidenceFact>
        </EvidenceFacts>
      </EvidenceSection>
      <EvidenceSection label="Steps" testId="import-run-steps">
        {run.steps.length === 0 ? (
          <p className="text-role-data text-mode-muted">No steps recorded.</p>
        ) : (
          <EvidenceFacts>
            {run.steps.map((step) => (
              <EvidenceFact key={step.id} label={importSourceLabel(step.step)}>
                <span className={step.ok ? undefined : 'text-mode-warn'}>
                  {step.ok ? importStepCountsLine(step.counts) : `Failed${step.error ? ` · ${step.error}` : ''}`}
                </span>
              </EvidenceFact>
            ))}
          </EvidenceFacts>
        )}
      </EvidenceSection>
      <EvidenceSection
        label={rows.isPending ? 'Orders' : `Orders · ${rows.total}`}
        testId="import-run-rows"
        action={
          <Link href={`${IMPORTS_PATH}?view=rows&run=${run.id}`} className={cn(RECORD_LABEL_CLASS, 'text-mode-ink hover:underline')}>
            Orders view →
          </Link>
        }
      >
        {rows.isPending ? (
          <p className="text-role-data text-mode-muted">Loading orders…</p>
        ) : rows.isError ? (
          <p className="text-role-data text-mode-warn">{rows.error.message}</p>
        ) : rows.items.length === 0 ? (
          <p className="text-role-data text-mode-muted">No orders in this run match the filters.</p>
        ) : (
          <EvidenceFacts>
            {rows.items.map((row) => {
              const channel = channelOf(row.externalOrderId, row.accountSource);
              const locator = importRowLocator(row);
              return (
                <EvidenceFact key={row.id} label={IMPORT_ROW_OUTCOME_LIFECYCLE[row.outcome].label}>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <ImportOrderNumber row={row} />
                    <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>
                      {channel.shortLabel} · {importSourceLabel(row.source)}
                      {locator ? ` · ${locator}` : ''}
                    </span>
                    {row.trackingNumber ? <span className={cn(RECORD_LABEL_CLASS, 'text-mode-ink')}>{row.trackingNumber}</span> : null}
                    <ImportFilledFields fields={row.filledFields} />
                    <ImportReviewDoor importExceptionId={row.importExceptionId} canReview={canReview} />
                  </span>
                </EvidenceFact>
              );
            })}
          </EvidenceFacts>
        )}
        {rows.hasNextPage ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => void rows.fetchNextPage()}
            disabled={rows.isFetchingNextPage}
          >
            {rows.isFetchingNextPage ? 'Loading…' : `Load more (${rows.items.length} of ${rows.total})`}
          </Button>
        ) : null}
      </EvidenceSection>
    </div>
  );
}
