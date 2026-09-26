'use client';

/**
 * The PACKAGE record — one carrier tracking number read whole
 * (`GET /api/shipments/[id]/record`, {@link useShipmentRecord}), placed by
 * `DeskRecordPlane` through the Shipped ledger: in place of the list by
 * default, beside it when the staffer chooses fullscreen.
 *
 *   state strip   CODE · word ······························ → next
 *   main          Items (every line in the box) · Actions (newest first)
 *                 · Other boxes on this order
 *   aside         tracking · carrier · packer · packed · shipped · carrier
 *                 milestones · box k of N · orders · exception · sync error
 *
 * Every instant arrives as ISO-with-offset and is painted in the warehouse
 * zone (`formatDateTimePST` / `formatMonthDayTimePST`). A missing fact paints
 * what its absence MEANS (`Never pack-scanned`, `Not scanned out`), never a
 * blank. The record carries no verbs — they live in the list's action strip.
 */

import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { EvidenceNotice, EvidenceSection, EvidenceStateStrip } from '@/design-system/components/record-ledger/RecordEvidence';
import { SkeletonList } from '@/design-system/components/Skeletons';
import { useShipmentRecord } from '@/lib/shipments/shipment-record-client';
import type { ShipmentRecord } from '@/lib/shipments/shipment-record-types';
import { isOpenExceptionStatus, shipmentOutboundStage, shippedPackageFace } from './shipped-package-state';
import { ShipmentActionRow, ShipmentFacts, ShipmentItem, SiblingRow } from './shipment-record-sections';

/** One column of the record: the industrial panel its sections stack in. */
const COLUMN_CLASS = 'flex min-w-0 flex-col border border-mode-ink bg-mode-panel';

export function ShipmentRecordView({
  shipmentId,
  onOpenShipment,
}: {
  shipmentId: number;
  /** Open another package (a sibling box) in this same plane. */
  onOpenShipment: (shipmentId: number) => void;
}) {
  const query = useShipmentRecord(shipmentId);

  if (query.isPending) {
    return (
      <div className="flex flex-1 flex-col bg-mode-canvas p-4" data-testid="shipment-record-view" aria-busy>
        <SkeletonList count={4} type="row" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-1 flex-col bg-mode-canvas p-4" data-testid="shipment-record-view">
        <EvidenceNotice tone="warn">{query.error.message}</EvidenceNotice>
      </div>
    );
  }
  return <ShipmentRecordBody record={query.data} onOpenShipment={onOpenShipment} />;
}

function ShipmentRecordBody({
  record,
  onOpenShipment,
}: {
  record: ShipmentRecord;
  onOpenShipment: (shipmentId: number) => void;
}) {
  const openException = record.exception != null && isOpenExceptionStatus(record.exception.status);
  const stage = shipmentOutboundStage({
    packedAt: record.pack?.packedAt ?? null,
    shipConfirmedAt: record.shipOut?.at ?? null,
    latestStatusCategory: record.status.category,
    latestEventAt: record.status.latestEventAt,
    isTerminal: record.status.isDelivered,
    hasException: record.status.hasException,
  });
  const state = shippedPackageFace(stage, openException);
  // The one next step this desk offers is the strip's Resolve exception.
  const next = openException ? 'Resolve exception' : null;

  const main = (
    <div className="flex min-w-0 flex-col gap-4">
      <div className={COLUMN_CLASS}>
        <EvidenceSection label={`Items · ${record.items.length}`} testId="shipment-record-items">
          {record.items.length === 0 ? (
            <p className="text-role-data text-mode-muted">
              {openException
                ? 'No order line claims this box — resolve the unmatched scan to link it.'
                : 'No order line is linked to this package.'}
            </p>
          ) : (
            <ul className="flex flex-col">
              {record.items.map((item) => (
                <ShipmentItem key={`${item.orderRowId}-${item.sku ?? ''}`} item={item} />
              ))}
            </ul>
          )}
        </EvidenceSection>
        <EvidenceSection label={`Actions · ${record.actions.length}`} testId="shipment-record-actions">
          {record.actions.length === 0 ? (
            <p className="text-role-data text-mode-muted">No actions recorded on this package.</p>
          ) : (
            <ol className="flex flex-col">
              {record.actions.map((action) => (
                <ShipmentActionRow key={action.id} action={action} />
              ))}
            </ol>
          )}
        </EvidenceSection>
        {record.siblings.length > 0 ? (
          <EvidenceSection label={`Other boxes on this order · ${record.siblings.length}`} testId="shipment-record-siblings">
            <ul className="flex flex-col">
              {record.siblings.map((sibling) => (
                <SiblingRow key={sibling.shipmentId} sibling={sibling} total={record.box?.total ?? null} onOpen={onOpenShipment} />
              ))}
            </ul>
          </EvidenceSection>
        ) : null}
      </div>
    </div>
  );

  const aside = (
    <div className={COLUMN_CLASS}>
      <ShipmentFacts record={record} />
    </div>
  );

  return (
    <div className="flex flex-1 flex-col gap-4 bg-mode-canvas p-4 text-mode-ink" data-testid="shipment-record-view">
      <div className="border border-mode-ink bg-mode-panel">
        <EvidenceStateStrip state={state} next={next} />
      </div>
      {record.sync.lastErrorMessage ? (
        <div className="border border-mode-ink">
          <EvidenceNotice tone="warn">
            Carrier sync failing — carrier facts may be stale or missing: {record.sync.lastErrorMessage}
          </EvidenceNotice>
        </div>
      ) : null}
      <DeskRecordLayout main={main} aside={aside} />
    </div>
  );
}
