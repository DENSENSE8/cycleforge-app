'use client';

/**
 * The record of one imported order (L3): the Why the row cannot carry — the
 * reason, every id the import holds for it, and its doors (the order, the run,
 * Review). Same view in place and in the split pane.
 */

import Link from 'next/link';
import {
  EvidenceFact,
  EvidenceFacts,
  EvidenceNotice,
  EvidenceSection,
  EvidenceStateStrip,
  evidenceVerbClass,
} from '@/design-system/components/record-ledger/RecordEvidence';
import type { ImportRunRowItem } from '@/lib/imports/types';
import type { PlatformDisplay } from '@/lib/platform-display';
import {
  IMPORTS_PATH,
  importOrderHref,
  importReviewHref,
  importRowReasonLabel,
  importSourceLabel,
  importStamp,
} from '@/lib/imports/record-faces';
import { IMPORT_ROW_OUTCOME_LIFECYCLE } from '@/design-system/tokens/import-record-lifecycle';
import { ImportFilledFields } from './import-record-parts';

export function ImportRowRecordView({
  row,
  channel,
  canReview,
}: {
  row: ImportRunRowItem;
  channel: PlatformDisplay;
  canReview: boolean;
}) {
  const state = IMPORT_ROW_OUTCOME_LIFECYCLE[row.outcome];
  const orderHref = importOrderHref(row.orderRowId);
  return (
    <div className="flex min-h-0 flex-col" data-testid="import-row-record">
      <EvidenceStateStrip state={state} next={row.importExceptionId != null ? 'Review' : null} />
      {row.reason ? <EvidenceNotice tone="warn">{importRowReasonLabel(row.reason)}</EvidenceNotice> : null}
      {orderHref == null ? (
        <EvidenceNotice>No order row: this import refused the order, so there is nothing to open.</EvidenceNotice>
      ) : null}
      <EvidenceSection label="Order">
        <EvidenceFacts>
          <EvidenceFact label="Order #" mono>{row.externalOrderId}</EvidenceFact>
          <EvidenceFact label="Order id" mono>{row.orderRowId ?? '—'}</EvidenceFact>
          <EvidenceFact label="Channel">
            {channel.label}
            {channel.connectionName ? ` · ${channel.connectionName}` : ''}
          </EvidenceFact>
          <EvidenceFact label="Account" mono>{row.accountSource ?? '—'}</EvidenceFact>
          <EvidenceFact label="Item #" mono>{row.itemNumber ?? '—'}</EvidenceFact>
          <EvidenceFact label="Tracking" mono>{row.trackingNumber ?? '—'}</EvidenceFact>
        </EvidenceFacts>
      </EvidenceSection>
      <EvidenceSection label="Import">
        <EvidenceFacts>
          <EvidenceFact label="Source">{importSourceLabel(row.source)}</EvidenceFact>
          <EvidenceFact label="Run" mono>
            <Link href={`${IMPORTS_PATH}?run=${row.runId}`} className="hover:underline">
              Run {row.runId}
            </Link>
          </EvidenceFact>
          <EvidenceFact label="When">{importStamp(row.createdAt)} PT</EvidenceFact>
          {row.sheetTab ? (
            <EvidenceFact label="Sheet" mono>
              {row.sheetTab}
              {row.sheetRow != null ? ` · row ${row.sheetRow}` : ''}
            </EvidenceFact>
          ) : null}
          {row.shipstationOrderId != null ? (
            <EvidenceFact label="ShipStation" mono>{row.shipstationOrderId}</EvidenceFact>
          ) : null}
          {row.shipstationShipmentId != null ? (
            <EvidenceFact label="SS shipment" mono>{row.shipstationShipmentId}</EvidenceFact>
          ) : null}
          <EvidenceFact label="Filled">
            {row.filledFields.length > 0 ? <ImportFilledFields fields={row.filledFields} /> : 'Nothing'}
          </EvidenceFact>
        </EvidenceFacts>
      </EvidenceSection>
      {orderHref || (row.importExceptionId != null && canReview) ? (
        <div className="flex gap-2 border-b border-mode-rule p-3 [&>*]:flex-1">
          {orderHref ? (
            <Link href={orderHref} className={evidenceVerbClass(true)}>
              Open order
            </Link>
          ) : null}
          {row.importExceptionId != null && canReview ? (
            <Link href={importReviewHref(row.importExceptionId)} className={evidenceVerbClass(false)}>
              Review
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
