'use client';

/**
 * The carton record's identity facts — the right column's read blocks:
 * purchase (platform, PO, vendor, source, listing, carton #), shipment
 * (tracking, carrier, status, delivered, last event), location (staging,
 * lane, bins), claims and notes. Blocks with nothing to say are omitted.
 */

import { EvidenceDisclosure, EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordListingLink } from '@/design-system/components/record-ledger/RecordIdentity';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import { TrackingIdentity } from '@/components/ui/OrderIdentityChips';
import { ReceivingRecordPlatform } from '@/components/receiving/ReceivingRecordIdentity';
import type { CartonRecordCarton } from '@/lib/receiving/carton-record-status';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { receivingRecordIdentity } from '@/lib/receiving/record-identity';
import { cn } from '@/utils/_cn';
import { CartonColumnHead, CartonStampFact, TicketLink } from './carton-record-sections';

const SOURCE_LABEL: Readonly<Record<string, string>> = {
  zoho_po: 'Zoho purchase order',
  unmatched: 'Unmatched carton',
  local_pickup: 'Local pickup',
};

export function CartonRecordFacts({
  receivingId,
  carton,
  live,
  lines,
  poNumber,
  tracking,
  carrier,
}: {
  receivingId: number;
  carton: CartonRecordCarton | null;
  /** The opened line, live — carries the carton-level joins every line shares. */
  live: ReceivingLineRow;
  lines: readonly ReceivingLineRow[];
  poNumber: string | null;
  tracking: string | null;
  carrier: string | null;
}) {
  const identity = receivingRecordIdentity(live);
  const vendor = (live.vendor_name || '').trim() || null;
  const source = (carton?.source || live.receiving_source || '').trim();
  const shipmentStatus = (live.shipment_status || '').trim() || null;
  const stagingLabel = (carton?.staging_location_label || live.staging_location_label || '').trim() || null;
  const bins = [...new Set(lines.map((line) => (line.staged_location_code || line.staged_location_name || '').trim()).filter(Boolean))];
  const tickets = [...new Set(lines.map((line) => (line.zendesk_ticket || '').trim()).filter(Boolean))];
  const supportNote = (carton?.support_notes || live.receiving_support_notes || '').trim() || null;
  const poNote = (carton?.zoho_notes || live.receiving_zoho_notes || '').trim() || null;

  return (
    <>
      <CartonColumnHead label="Purchase" />
      <div className="flex flex-col border-b border-mode-ink px-4 [&>*:last-child]:border-b-0" data-testid="carton-record-purchase">
        <EvidenceFactRow label="Platform">
          <span className="flex h-8 items-center">
            <ReceivingRecordPlatform row={live} />
          </span>
        </EvidenceFactRow>
        <EvidenceFactRow label="PO #">
          <span className={cn(RECORD_ID_CLASS, 'select-all', !poNumber && 'text-mode-warn')}>{poNumber ?? 'NOT PAIRED'}</span>
        </EvidenceFactRow>
        {vendor ? <EvidenceFactRow label="Vendor">{vendor}</EvidenceFactRow> : null}
        {source ? (
          <EvidenceFactRow label="Source">
            {SOURCE_LABEL[source] ?? source}
            {carton?.is_return ? ` · return${carton.return_reason ? ` (${carton.return_reason})` : ''}` : ''}
          </EvidenceFactRow>
        ) : null}
        <EvidenceFactRow label="Listing">
          <span className="block h-8">
            <RecordListingLink href={identity.listingHref} itemNumber={identity.itemNumber} face="value" />
          </span>
        </EvidenceFactRow>
        <EvidenceFactRow label="Carton">
          <span className={cn(RECORD_ID_CLASS, 'select-all')}>#{receivingId}</span>
        </EvidenceFactRow>
      </div>
      <CartonColumnHead label="Shipment" />
      <div className="flex flex-col border-b border-mode-ink px-4 [&>*:last-child]:border-b-0" data-testid="carton-record-shipment">
        <EvidenceFactRow label="TRK#">
          {tracking ? (
            <TrackingIdentity tracking={tracking} carrierHint={carrier} />
          ) : (
            <span className={cn(RECORD_ID_CLASS, 'text-mode-warn')}>NOT ATTACHED</span>
          )}
        </EvidenceFactRow>
        {carrier ? <EvidenceFactRow label="Carrier">{carrier}</EvidenceFactRow> : null}
        {shipmentStatus ? <EvidenceFactRow label="Status">{shipmentStatus}</EvidenceFactRow> : null}
        <CartonStampFact label="Delivered" at={live.delivered_at} />
        <CartonStampFact label="Last event" who={live.shipment_latest_event_city} at={live.shipment_latest_event_at} />
      </div>
      {stagingLabel || bins.length > 0 || live.priority_lane ? (
        <>
          <CartonColumnHead label="Location" />
          <div className="flex flex-col border-b border-mode-ink px-4 [&>*:last-child]:border-b-0" data-testid="carton-record-location">
            {stagingLabel ? <EvidenceFactRow label="Staging">{stagingLabel}</EvidenceFactRow> : null}
            {live.priority_lane ? <EvidenceFactRow label="Lane">{live.priority_lane}</EvidenceFactRow> : null}
            {bins.length > 0 ? (
              <EvidenceFactRow label="Bin">
                <span className={RECORD_ID_CLASS}>{bins.join(', ')}</span>
              </EvidenceFactRow>
            ) : null}
          </div>
        </>
      ) : null}
      {tickets.length > 0 ? (
        <>
          <CartonColumnHead label="Claims" />
          <div className="flex flex-wrap gap-x-3 border-b border-mode-ink px-4 py-2" data-testid="carton-record-tickets">
            {tickets.map((ticket) => (
              <TicketLink key={ticket} ticket={ticket} />
            ))}
          </div>
        </>
      ) : null}
      {supportNote ? (
        <>
          <CartonColumnHead label="Carton note" />
          <p className="whitespace-pre-wrap border-b border-mode-ink px-4 py-2 text-role-data">{supportNote}</p>
        </>
      ) : null}
      {poNote ? (
        <EvidenceDisclosure
          label="PO note"
          testId="carton-record-po-note"
          summary={<span className="truncate text-role-caption text-mode-muted">{poNote.split('\n')[0]}</span>}
        >
          <p className="whitespace-pre-wrap break-words px-4 py-2 text-role-data">{poNote}</p>
        </EvidenceDisclosure>
      ) : null}
    </>
  );
}
