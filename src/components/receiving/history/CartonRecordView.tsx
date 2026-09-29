'use client';

/**
 * The receiving CARTON record — one record view for every desk that lists docked cartons (the Inbound desk's Docked lane and the Unbox…
 * Built for triage at a glance (owner 2026-09-25), on the order record's shape
 * (owner 2026-09-28): left, the work — Fulfilment, then Items, then disclosed
 * evidence; right, Photos above the Purchase and Shipment facts. Every group
 * is one `RecordGroup` card.
 */

import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { EvidenceDisclosure } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { DESK_RECORD_COLUMN_CARD_CLASS } from '@/design-system/tokens/desk-stage';
import { ReceivingFulfilment } from '@/components/receiving/record/ReceivingStatusStrip';
import { ReceivingPhotosSection } from '@/components/station/receiving/ReceivingPhotosSection';
import { ReceivingAuditPanel } from '@/components/receiving/workspace/ReceivingAuditPanel';
import { ZohoReceiveSyncControl } from '@/components/zoho/ZohoReceiveSyncControl';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/_cn';
import { CartonItem } from './carton-record-sections';
import { CartonRecordFacts } from './carton-record-facts';
import type { CartonRecord } from './use-carton-record';

export function CartonRecordView({
  record,
  openLineId,
  onClose,
  surface = 'unboxed',
}: {
  record: CartonRecord;
  /** The line the staffer opened from the list — highlighted among the items. */
  openLineId: number;
  onClose: () => void;
  surface?: 'docked' | 'unboxed';
}) {
  const { receivingId, carton, lines, itemLines, live, poNumber, unfound } = record;
  const photoCount = live.photo_count ?? null;
  const canSyncZoho = useAuth().has('integrations.zoho');

  const main = (
    <div className="flex min-w-0 flex-col gap-4">
      <ReceivingFulfilment steps={record.steps} testId="carton-record-fulfilment" />
      <RecordGroup title={`Items · ${itemLines.length}`} testId="carton-record-items">
        {record.linesLoading ? (
          <div className="p-3">
            <SkeletonList count={3} type="row" />
          </div>
        ) : itemLines.length === 0 ? (
          <EvidenceNotice>
            No item lines on this carton yet — {unfound ? 'pair it to a purchase order in Unbox.' : 'open it in Unbox to add its contents.'}
          </EvidenceNotice>
        ) : (
          itemLines.map((line) => <CartonItem key={line.id} line={line} current={line.id === openLineId} surface={surface} />)
        )}
      </RecordGroup>
      <RecordGroup title="More details" testId="carton-record-more-details">
        <EvidenceDisclosure label="Timeline" summary="Receiving activity" testId="carton-record-timeline" lazy>
          <div className="px-3 py-2">
            <ReceivingAuditPanel open receivingId={receivingId} onClose={onClose} hideHeader />
          </div>
        </EvidenceDisclosure>
      </RecordGroup>
    </div>
  );

  const aside = (
    <div className="flex min-w-0 flex-col gap-4">
      {canSyncZoho ? (
        // Right rail, top (owner 2026-09-29): pushes every unboxed / received
        // line Zoho has not recorded yet — not just this carton; the drain
        // also runs every 5 minutes.
        <RecordGroup title="Zoho" testId="carton-record-zoho">
          <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-1" data-testid="carton-record-zoho-sync">
            <span className="text-role-caption text-text-muted">Received status</span>
            <ZohoReceiveSyncControl />
          </div>
        </RecordGroup>
      ) : null}
      <RecordGroup title={photoCount != null ? `Photos · ${photoCount}` : 'Photos'} testId="carton-record-photos">
        <div className="px-4 pb-3 pt-1">
          <ReceivingPhotosSection
            receivingId={String(receivingId)}
            poRef={poNumber}
            readOnly
            hideHeader
            launcherTitle="Scan bench photos"
          />
        </div>
      </RecordGroup>
      <CartonRecordFacts
        receivingId={receivingId}
        carton={carton}
        live={live}
        lines={lines}
        poNumber={poNumber}
        tracking={record.tracking}
        carrier={record.carrier}
      />
    </div>
  );

  return (
    <div className="flex flex-1 flex-col gap-4 bg-mode-canvas p-4 text-mode-ink" data-testid="carton-record-view">
      {record.loadFailed ? (
        <div className={cn(DESK_RECORD_COLUMN_CARD_CLASS, 'flex-row items-center gap-3')}>
          <div className="min-w-0 flex-1">
            <EvidenceNotice tone="warn">
              Some receiving evidence could not be loaded. Missing data is not proof of non-receipt.
            </EvidenceNotice>
          </div>
          <Button variant="secondary" size="sm" className="mr-3" onClick={record.refresh}>
            Retry
          </Button>
        </div>
      ) : null}
      <DeskRecordLayout main={main} aside={aside} />
    </div>
  );
}
