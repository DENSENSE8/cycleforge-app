'use client';

/**
 * The receiving CARTON record — one record view for every desk that lists
 * docked cartons (the Inbound desk's Docked lane and the Unbox History tab,
 * both through `DockedReceiptsLedger`), placed by `DeskRecordPlane`: below the
 * list's anchor (search row + action strip) by default, beside the list when
 * the staffer chooses fullscreen. The plane paints the header band (PO /
 * carton, n of N, ‹ ›, ✕) and owns Esc; the ledger owns J / K.
 *
 * Built for triage at a glance (owner 2026-09-25), on the order record's shape:
 *   - TOP — {@link ReceivingStatusStrip}: the overall state in the ledger row's
 *     own vocabulary (`dockedReceivingState`, so row and record agree), the
 *     next step (`deriveCartonReadiness`), the loud alerts (unfound, wrong
 *     destination, claims, write-off …) and the carton pipeline with who / when
 *     per step (`carton-record-status.ts`) — only steps that apply.
 *   - CENTER — the items: every line of the carton with its Zoho-governed
 *     identity and its own chain (condition, serials, test, label, received,
 *     put away, claim ticket), then the photos and the carton timeline.
 *   - RIGHT — facts and notes only: purchase, shipment, location, claims,
 *     carton / PO notes.
 * The record paints NO verbs: they live in the action strip under the list's
 * search bar (`carton-record-verbs.tsx`). Full station work stays on the Unbox
 * bench (`Open in Unbox`).
 */

import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { Button } from '@/design-system/primitives';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { ReceivingStatusStrip } from '@/components/receiving/record/ReceivingStatusStrip';
import { ReceivingPhotosSection } from '@/components/station/receiving/ReceivingPhotosSection';
import { ReceivingAuditPanel } from '@/components/receiving/workspace/ReceivingAuditPanel';
import { dockedReceivingState } from '@/lib/receiving/docked-record-state';
import { CARTON_COLUMN_CLASS, CartonColumnHead, CartonItem } from './carton-record-sections';
import { CartonRecordFacts } from './carton-record-facts';
import type { CartonRecord } from './use-carton-record';

export function CartonRecordView({
  record,
  openLineId,
  onClose,
}: {
  record: CartonRecord;
  /** The line the staffer opened from the list — highlighted among the items. */
  openLineId: number;
  onClose: () => void;
}) {
  const { receivingId, carton, lines, itemLines, live, poNumber, unfound } = record;
  const photoCount = live.photo_count ?? null;

  const main = (
    <div className="flex min-w-0 flex-col gap-4">
      <div className={CARTON_COLUMN_CLASS} data-testid="carton-record-items">
        <CartonColumnHead label={`Items · ${itemLines.length}`} />
        {record.linesLoading ? (
          <div className="p-3">
            <SkeletonList count={3} type="row" />
          </div>
        ) : itemLines.length === 0 ? (
          <EvidenceNotice>
            No item lines on this carton yet — {unfound ? 'pair it to a purchase order in Unbox.' : 'open it in Unbox to add its contents.'}
          </EvidenceNotice>
        ) : (
          itemLines.map((line) => <CartonItem key={line.id} line={line} current={line.id === openLineId} />)
        )}
      </div>
      <div className={CARTON_COLUMN_CLASS} data-testid="carton-record-photos">
        <CartonColumnHead label={photoCount != null ? `Photos · ${photoCount}` : 'Photos'} />
        <div className="p-3">
          <ReceivingPhotosSection
            receivingId={String(receivingId)}
            poRef={poNumber}
            readOnly
            hideHeader
            launcherTitle="Scan bench photos"
          />
        </div>
      </div>
      <div className={CARTON_COLUMN_CLASS} data-testid="carton-record-timeline">
        <CartonColumnHead label="Timeline" />
        <div className="px-3 py-2">
          <ReceivingAuditPanel open receivingId={receivingId} onClose={onClose} hideHeader />
        </div>
      </div>
    </div>
  );

  const aside = (
    <div className={CARTON_COLUMN_CLASS}>
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
      <ReceivingStatusStrip
        state={dockedReceivingState(live)}
        next={record.readiness?.nextStep ?? null}
        count={`${itemLines.length} ${itemLines.length === 1 ? 'item' : 'items'}`}
        steps={record.steps}
        alerts={record.alerts}
        testId="carton-record-status"
      />
      {record.loadFailed ? (
        <div className="flex items-center gap-3 border border-mode-ink bg-mode-bar">
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
