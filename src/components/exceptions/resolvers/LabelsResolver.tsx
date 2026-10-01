'use client';

import { useMemo, useState } from 'react';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { useResolveLabelsException } from '@/hooks/exceptions';
import type { LabelsExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { LABEL_PURPOSES, LABEL_PURPOSE_FACE, type LabelPurpose } from '@/lib/shipping/label-purpose';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cn } from '@/utils/_cn';
import { resolveWith } from './resolve-feedback';

/**
 * Labels & docs — the order's latest label ingestion is quarantined or
 * failed. In place: re-ingest the PDF (the parser / matcher runs again), or —
 * for a ShipStation label — pair it to this order as its outbound / return /
 * replacement label.
 */
export function LabelsResolver({ row, facts }: { row: ExceptionRow; facts: LabelsExceptionFacts }) {
  const { order, ingestion } = facts;
  const orderRef = order.orderNumber || `order-${order.id}`;
  const resolve = useResolveLabelsException();
  const [purpose, setPurpose] = useState<LabelPurpose>('outbound');
  // One idempotency key per intended link, so a retried click never links twice.
  const clientEventId = useMemo(() => safeRandomUUID(), []);
  const shipmentId = ingestion.shipstationShipmentId;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-labels">
      <RecordGroup title="Label ingestion">
        <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
          <EvidenceFactRow label="State">
            <span className="text-mode-warn">{sentenceCaseLabel(ingestion.state)}</span>
          </EvidenceFactRow>
          {ingestion.quarantineReasonCode ? (
            <EvidenceFactRow label="Reason">{sentenceCaseLabel(ingestion.quarantineReasonCode)}</EvidenceFactRow>
          ) : null}
          <EvidenceFactRow label="File">
            <span className={cn(RECORD_ID_CLASS, 'select-all')}>{ingestion.fileBasename}</span>
          </EvidenceFactRow>
          <EvidenceFactRow label="Tracking">
            <span className={RECORD_ID_CLASS}>{ingestion.trackingNumberNormalized ?? ingestion.trackingNumberRaw ?? '—'}</span>
            {ingestion.carrier ? ` · ${ingestion.carrier}` : ''}
          </EvidenceFactRow>
          <EvidenceFactRow label="Source">{sentenceCaseLabel(ingestion.source)}</EvidenceFactRow>
        </div>
      </RecordGroup>
      <RecordGroup title="Resolve">
        <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant={shipmentId != null ? 'secondary' : 'primary'}
              loading={resolve.isPending && resolve.variables?.action === 'retry'}
              disabled={resolve.isPending}
              onClick={() => resolveWith(resolve, { action: 'retry', ingestionId: ingestion.id }, `Re-ingesting ${ingestion.fileBasename}`)}
              data-testid="exception-labels-retry"
            >
              Re-ingest label
            </Button>
          </div>
          {shipmentId != null ? (
            <fieldset className="flex flex-col gap-2 border-t border-mode-rule pt-3">
              <legend className="sr-only">Pair this ShipStation label to {orderRef}</legend>
              <div role="radiogroup" aria-label="Label purpose" className="flex flex-wrap gap-2">
                {LABEL_PURPOSES.map((value) => (
                  <Button
                    key={value}
                    variant={purpose === value ? 'ink' : 'ghost'}
                    size="sm"
                    role="radio"
                    aria-checked={purpose === value}
                    onClick={() => setPurpose(value)}
                  >
                    {LABEL_PURPOSE_FACE[value].label}
                  </Button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  loading={resolve.isPending && resolve.variables?.action === 'link-to-order'}
                  disabled={resolve.isPending}
                  onClick={() =>
                    resolveWith(
                      resolve,
                      { action: 'link-to-order', orderId: order.id, shipstationShipmentId: shipmentId, purpose, clientEventId, clears: row.key },
                      `Label paired to ${orderRef}`,
                    )
                  }
                  data-testid="exception-labels-link"
                >
                  Pair to {orderRef}
                </Button>
              </div>
            </fieldset>
          ) : null}
        </div>
      </RecordGroup>
    </div>
  );
}
