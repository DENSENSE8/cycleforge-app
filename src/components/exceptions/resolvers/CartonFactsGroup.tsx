'use client';

import { format } from 'date-fns';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import type { CartonExceptionFacts } from '@/lib/exceptions/facts';
import { cn } from '@/utils/_cn';

/** A received carton's identity — the Claim · Short · Unfound resolvers' shared head. */
export function CartonFactsGroup({ carton }: { carton: CartonExceptionFacts['carton'] }) {
  const unboxed = carton.unboxedAt ? new Date(carton.unboxedAt) : null;
  return (
    <RecordGroup title="Carton">
      <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
        <EvidenceFactRow label="PO">
          <span className={cn(RECORD_ID_CLASS, !carton.poNumber && 'text-mode-warn')}>{carton.poNumber ?? 'No PO'}</span>
        </EvidenceFactRow>
        <EvidenceFactRow label="Tracking">
          <span className={cn(RECORD_ID_CLASS, 'select-all')}>{carton.tracking ?? '—'}</span>
          {carton.carrier ? ` · ${carton.carrier}` : ''}
        </EvidenceFactRow>
        {carton.source ? <EvidenceFactRow label="Source">{carton.source}</EvidenceFactRow> : null}
        <EvidenceFactRow label="Unboxed">
          {unboxed && !Number.isNaN(unboxed.getTime()) ? format(unboxed, 'MMM d, yyyy · h:mm a') : '—'}
        </EvidenceFactRow>
      </div>
    </RecordGroup>
  );
}

/** A receiving line's display title. */
export function lineTitle(line: CartonExceptionFacts['lines'][number]): string {
  return line.item_name?.trim() || line.zoho_item_title?.trim() || line.sku?.trim() || `Line ${line.id}`;
}
