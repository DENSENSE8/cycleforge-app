'use client';

/** The leaf parts of the package record ({@link ShipmentRecordView}): */

import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Barcode,
  Boxes,
  Camera,
  ExternalLink,
  History,
  MessageSquare,
  Truck,
} from '@/components/Icons';
import { CopyChip } from '@/components/ui/CopyChip';
import { RecordPhoto } from '@/design-system/components/record-ledger/IndustrialRecord';
import { EvidenceFact, EvidenceFacts, EvidenceSection } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_TITLE_CLASS } from '@/design-system/tokens/industrial-record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { conditionLabel } from '@/lib/conditions';
import type {
  ShipmentActionSource,
  ShipmentRecord,
  ShipmentRecordAction,
  ShipmentRecordItem,
  ShipmentRecordSibling,
} from '@/lib/shipments/shipment-record-types';
import { formatDateTimePST, formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { isOpenExceptionStatus } from './shipped-package-state';

const GLYPH_CLASS = 'h-3.5 w-3.5 shrink-0';

const SOURCE_GLYPH: Readonly<Record<ShipmentActionSource, ReactNode>> = {
  station: <Barcode className={GLYPH_CLASS} />,
  audit: <History className={GLYPH_CLASS} />,
  carrier: <Truck className={GLYPH_CLASS} />,
  exception: <AlertTriangle className={GLYPH_CLASS} />,
  inventory: <Boxes className={GLYPH_CLASS} />,
  photo: <Camera className={GLYPH_CLASS} />,
  note: <MessageSquare className={GLYPH_CLASS} />,
};

/** Full instant, or what its absence means. */
function when(at: string | null | undefined, missing: string): ReactNode {
  return at ? formatDateTimePST(at) : <span className="text-mode-muted">{missing}</span>;
}

export function ShipmentItem({ item }: { item: ShipmentRecordItem }) {
  const title = item.title || 'Untitled line';
  return (
    <li className="flex min-w-0 gap-3 border-b border-mode-rule py-2 last:border-b-0" data-testid="shipment-record-item">
      <span className="relative h-14 w-14 shrink-0 overflow-hidden border border-mode-rule bg-mode-well">
        <RecordPhoto src={item.photoUrl} fallback={title} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className={cn(RECORD_TITLE_CLASS, 'flex-1')} title={title}>
            {title}
          </span>
          <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>
            QTY <span className={cn(RECORD_ID_CLASS, 'text-mode-ink')}>{item.quantity ?? '—'}</span>
          </span>
        </div>
        <div className={cn(RECORD_LABEL_CLASS, 'flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-mode-muted')}>
          <span>
            SKU <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{item.sku || '—'}</span>
          </span>
          <span>
            COND <span className="text-mode-ink">{item.condition ? conditionLabel(item.condition) : '—'}</span>
          </span>
          <span>
            ORD{' '}
            <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>
              {item.orderRef || `#${item.orderRowId}`}
            </span>
            {item.channel ? <span className="text-mode-ink"> · {item.channel}</span> : null}
          </span>
          <span>
            STATUS <span className="text-mode-ink">{item.orderStatus || '—'}</span>
          </span>
        </div>
        {item.serials.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {item.serials.map((serial) => (
              <li key={serial.serial} className={cn(RECORD_LABEL_CLASS, 'flex min-w-0 gap-2 text-mode-muted')}>
                <span>SN</span>
                <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{serial.serial}</span>
                <span className="truncate normal-case tracking-normal">
                  {serial.testedByName || serial.testedAt
                    ? `tested ${[serial.testedByName, serial.testedAt ? formatMonthDayTimePST(serial.testedAt) : null].filter(Boolean).join(' · ')}`
                    : 'not tested'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>No serials scanned</span>
        )}
      </div>
    </li>
  );
}

export function ShipmentActionRow({ action }: { action: ShipmentRecordAction }) {
  const meta = [action.actorName, action.station].filter(Boolean).join(' · ');
  return (
    <li className="flex min-w-0 gap-3 border-b border-mode-rule py-1.5 last:border-b-0" data-testid="shipment-record-action">
      <time
        dateTime={action.at}
        className={cn(RECORD_LABEL_CLASS, 'w-28 shrink-0 pt-0.5 text-mode-muted')}
        title={formatDateTimePST(action.at)}
      >
        {formatMonthDayTimePST(action.at)}
      </time>
      <span className="pt-0.5 text-mode-muted" title={action.source} aria-label={action.source}>
        {SOURCE_GLYPH[action.source]}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-role-data font-bold text-mode-ink" title={action.kind}>
          {action.label}
        </span>
        {meta ? <span className="text-role-data text-mode-muted">{meta}</span> : null}
        {action.detail ? <span className="break-words text-role-data text-mode-muted">{action.detail}</span> : null}
      </div>
    </li>
  );
}

export function SiblingRow({
  sibling,
  total,
  onOpen,
}: {
  sibling: ShipmentRecordSibling;
  total: number | null;
  onOpen: (shipmentId: number) => void;
}) {
  const box = sibling.boxSeq != null ? `Box ${sibling.boxSeq}${total ? ` of ${total}` : ''}` : sibling.isPrimary ? 'Primary' : 'Box';
  return (
    <li className="border-b border-mode-rule last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(sibling.shipmentId)}
        data-testid="shipment-record-sibling"
        className={cn('ds-raw-button flex w-full min-w-0 items-center gap-3 py-1.5 text-left hover:bg-mode-hover', focusRing('control'))}
      >
        <span className={cn(RECORD_LABEL_CLASS, 'w-20 shrink-0 text-mode-muted')}>{box}</span>
        <span className={cn(RECORD_ID_CLASS, 'min-w-0 flex-1 truncate')}>{sibling.tracking}</span>
        <span className="shrink-0 text-role-data text-mode-muted">
          {sibling.packedAt
            ? `Packed ${formatMonthDayTimePST(sibling.packedAt)}${sibling.packerName ? ` · ${sibling.packerName}` : ''}`
            : 'Never pack-scanned'}
        </span>
        <span className="w-40 shrink-0 text-right text-role-data text-mode-ink">
          {sibling.shippedAt ? `Shipped ${formatMonthDayTimePST(sibling.shippedAt)}` : 'Not scanned out'}
        </span>
      </button>
    </li>
  );
}

export function ShipmentFacts({ record }: { record: ShipmentRecord }) {
  const { pack, shipOut, carrierMilestones: m, box, exception } = record;
  const orderRefs = [...new Set(record.items.map((item) => item.orderRef || `#${item.orderRowId}`))];
  return (
    <>
      <EvidenceSection label="Package" testId="shipment-record-facts">
        <EvidenceFacts>
          <EvidenceFact label="Tracking">
            <span className="flex min-w-0 items-center gap-1">
              <CopyChip value={record.tracking} display={record.tracking} tone="tracking" fitDisplayWidth />
              {record.trackingUrl ? (
                <a
                  href={record.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Track ${record.tracking} on the carrier site`}
                  className={cn('inline-flex shrink-0 items-center text-mode-muted hover:text-mode-ink', focusRing('control'))}
                >
                  <ExternalLink className={GLYPH_CLASS} />
                </a>
              ) : null}
            </span>
          </EvidenceFact>
          <EvidenceFact label="Carrier">{record.carrier || <span className="text-mode-muted">Unknown</span>}</EvidenceFact>
          <EvidenceFact label="Status">
            {record.status.label ? (
              <span title={record.status.description ?? undefined}>
                {record.status.label}
                {record.status.latestEventAt ? (
                  <span className="text-mode-muted"> · {formatMonthDayTimePST(record.status.latestEventAt)}</span>
                ) : null}
              </span>
            ) : (
              <span className="text-mode-muted">No carrier scan yet</span>
            )}
          </EvidenceFact>
          <EvidenceFact label="Box">
            {box ? `${box.seq ?? '—'} of ${box.total}${box.isPrimary ? ' · primary' : ''}` : <span className="text-mode-muted">Single box</span>}
          </EvidenceFact>
          <EvidenceFact label={orderRefs.length > 1 ? 'Orders' : 'Order'} mono>
            {orderRefs.length > 0 ? orderRefs.join(', ') : <span className="text-mode-muted">No order linked</span>}
          </EvidenceFact>
        </EvidenceFacts>
      </EvidenceSection>

      <EvidenceSection label="Warehouse">
        <EvidenceFacts>
          <EvidenceFact label="Packer">
            {pack ? pack.packerName || `Staff #${pack.packerStaffId ?? '—'}` : <span className="text-mode-warn">Never pack-scanned</span>}
          </EvidenceFact>
          <EvidenceFact label="Packed at">{when(pack?.packedAt, 'Never pack-scanned')}</EvidenceFact>
          <EvidenceFact label="Shipped at">
            {shipOut ? (
              <span className="flex flex-wrap items-center gap-x-2">
                <span>{formatDateTimePST(shipOut.at)}</span>
                {shipOut.backfilled ? (
                  <span
                    className={cn(RECORD_LABEL_CLASS, 'border border-mode-warn px-1 text-mode-warn')}
                    title="Recorded by an ops backfill, not a live dock scan"
                    data-testid="shipment-record-backfilled"
                  >
                    Backfilled
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="text-mode-muted">Not scanned out</span>
            )}
          </EvidenceFact>
          <EvidenceFact label="Shipped by">
            {shipOut ? shipOut.staffName || `Staff #${shipOut.staffId ?? '—'}` : <span className="text-mode-muted">—</span>}
          </EvidenceFact>
        </EvidenceFacts>
      </EvidenceSection>

      <EvidenceSection label="Carrier">
        <EvidenceFacts>
          <EvidenceFact label="Label">{when(m.labelCreatedAt, '—')}</EvidenceFact>
          <EvidenceFact label="Accepted">{when(m.acceptedAt, 'Not yet')}</EvidenceFact>
          <EvidenceFact label="In transit">{when(m.inTransitAt, 'Not yet')}</EvidenceFact>
          <EvidenceFact label="Out for del.">{when(m.outForDeliveryAt, 'Not yet')}</EvidenceFact>
          <EvidenceFact label="Delivered">{when(m.deliveredAt, 'Not yet')}</EvidenceFact>
          {m.exceptionAt ? <EvidenceFact label="Exception">{formatDateTimePST(m.exceptionAt)}</EvidenceFact> : null}
          <EvidenceFact label="Last sync">{when(record.sync.lastCheckedAt, 'Never checked')}</EvidenceFact>
          {record.sync.lastErrorMessage ? (
            <EvidenceFact label="Sync error">
              <span className={STATE_TONE_CLASSES.danger.text}>
                {record.sync.lastErrorCode ? `${record.sync.lastErrorCode}: ` : ''}
                {record.sync.lastErrorMessage}
              </span>
            </EvidenceFact>
          ) : null}
        </EvidenceFacts>
      </EvidenceSection>

      {exception ? (
        <EvidenceSection label={`Exception #${exception.id}`} testId="shipment-record-exception">
          <EvidenceFacts>
            <EvidenceFact label="Status">
              <span className={isOpenExceptionStatus(exception.status) ? 'font-bold text-mode-warn' : undefined}>
                {exception.status}
              </span>
            </EvidenceFact>
            <EvidenceFact label="Reason">{(exception.reason || '—').replace(/_/g, ' ')}</EvidenceFact>
            <EvidenceFact label="Station">{exception.sourceStation || '—'}</EvidenceFact>
            <EvidenceFact label="By">{exception.staffName || '—'}</EvidenceFact>
            <EvidenceFact label="At">{when(exception.createdAt, '—')}</EvidenceFact>
            <EvidenceFact label="Notes">{exception.notes || <span className="text-mode-muted">—</span>}</EvidenceFact>
          </EvidenceFacts>
        </EvidenceSection>
      ) : null}
    </>
  );
}
