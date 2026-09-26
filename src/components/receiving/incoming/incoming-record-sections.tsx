'use client';

/** The incoming delivery record's leaf sections — one purchase-order line with its own status chain ({@link IncomingItem}) and the right… */

import type { ReactNode } from 'react';
import { ExternalLink } from '@/components/Icons';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordPhoto, recordInitials } from '@/design-system/components/record-ledger/IndustrialRecord';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_PRICE_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { TrackingIdentity } from '@/components/ui/OrderIdentityChips';
import {
  CARTON_COLUMN_CLASS,
  CartonColumnHead,
  CartonStampFact,
  TicketLink,
} from '@/components/receiving/history/carton-record-sections';
import { EbayTab } from '@/components/sidebar/receiving/incoming-details/EbayTab';
import { NotesTab } from '@/components/sidebar/receiving/incoming-details/NotesTab';
import {
  fmtDate,
  fmtMoney,
  type DetailsResponse,
} from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { conditionLabel } from '@/lib/conditions';
import { receivingRecordSerials } from '@/lib/receiving/record-identity';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

const positiveId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

/** The carton a delivery landed in — from the details read, else the row. */
export function cartonIdOf(row: ReceivingLineRow, data: DetailsResponse | undefined): number | null {
  return positiveId(data?.receiving?.id) ?? positiveId(row.receiving_id);
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-mode-muted">{children}</span>;
}

const stamp = (value: string | null | undefined): string | null =>
  value && value.trim() ? formatMonthDayTimePST(value) : null;

/**
 * One purchase-order line: what it is (the Zoho-governed title), ordered vs
 * received, its cost, then — once the line has reached the warehouse — its
 * own status chain. Only the facts the line carries paint; nothing is dashed in.
 */
export function IncomingItem({
  title,
  sku,
  received,
  expected,
  unitCost,
  lineTotal,
  workflow,
  listing,
  description,
  row,
  current,
}: {
  title: string;
  sku: string | null;
  received: number;
  expected: number;
  unitCost: string;
  lineTotal: string | null;
  workflow: string | null;
  listing: string | null;
  description: string | null;
  /** The loaded `receiving_lines` row for this PO line, when it is on the page. */
  row: ReceivingLineRow | null;
  current: boolean;
}) {
  const short = received < expected;
  const serials = row ? receivingRecordSerials(row) : [];
  const tested = row ? Boolean(row.tested_at) || (row.tested_count ?? 0) > 0 : false;
  const bin = row ? (row.staged_location_code || row.staged_location_name || '').trim() || null : null;
  const ticket = row ? (row.zendesk_ticket || '').trim() || null : null;
  const note = row ? (row.notes || '').trim() || null : null;

  return (
    <article
      data-testid="incoming-record-item"
      data-current={current ? '' : undefined}
      aria-label={title}
      className={cn('border-b border-mode-ink last:border-b-0', current ? 'bg-mode-panel' : 'bg-mode-bar')}
    >
      <div className="flex gap-3 p-3">
        <span className="relative h-16 w-16 shrink-0 overflow-hidden border border-mode-rule bg-mode-well">
          <RecordPhoto src={row?.image_url ?? null} fallback={recordInitials(title)} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start gap-2">
            <p className="line-clamp-2 min-w-0 flex-1 text-role-body font-bold" title={title}>
              {title}
            </p>
            <span
              className={cn(RECORD_ID_CLASS, 'shrink-0', short ? 'text-mode-warn' : 'text-mode-ink')}
              data-testid="incoming-item-qty"
              title="Received / ordered"
            >
              {received}/{expected}
            </span>
          </div>
          <p className={cn(RECORD_LABEL_CLASS, 'flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-mode-muted')}>
            <span>
              SKU <span className={cn(RECORD_ID_CLASS, 'select-all normal-case tracking-normal text-mode-ink')}>{sku || '—'}</span>
            </span>
            <span>
              UNIT <span className={cn(RECORD_PRICE_CLASS, 'normal-case tracking-normal')}>{unitCost}</span>
            </span>
            {lineTotal ? (
              <span>
                TOTAL <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{lineTotal}</span>
              </span>
            ) : null}
            {workflow ? <span>{workflow.replaceAll('_', ' ')}</span> : null}
            {listing ? (
              <a
                href={listing}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('inline-flex items-center gap-1 text-mode-ink underline decoration-mode-edge underline-offset-2', focusRing('control'))}
              >
                LISTING <ExternalLink aria-hidden className="h-3 w-3" />
              </a>
            ) : null}
          </p>
        </div>
      </div>
      {row && (row.received_at || row.unboxed_at || row.condition_graded_at || serials.length || tested || row.needs_test || row.label_printed_at || row.received_done_at || bin || ticket || note) ? (
        <div className="flex flex-col px-4 pb-2" data-testid="incoming-item-chain">
          {row.unboxed_at ? (
            <EvidenceFactRow label="Unboxed">
              {[row.unboxed_by_name, stamp(row.unboxed_at)].filter(Boolean).join(' · ')}
            </EvidenceFactRow>
          ) : null}
          {row.condition_graded_at ? (
            <EvidenceFactRow label="Condition">
              <span>
                {conditionLabel(row.condition_grade, 'label')} <Muted>· graded {stamp(row.condition_graded_at)}</Muted>
              </span>
            </EvidenceFactRow>
          ) : null}
          {serials.length ? (
            <EvidenceFactRow label="Serials" wide={serials.length > 1}>
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5 py-1">
                {serials.map((serial) => (
                  <li key={serial} className={cn(RECORD_ID_CLASS, 'select-all break-all')}>
                    {serial}
                  </li>
                ))}
              </ul>
            </EvidenceFactRow>
          ) : null}
          {tested || row.needs_test ? (
            <EvidenceFactRow label="Test">
              {tested ? (
                <span>
                  Tested{(row.tested_count ?? 0) > 1 ? ` ×${row.tested_count}` : ''}
                  {row.tested_at ? <Muted> · {stamp(row.tested_at)}</Muted> : null}
                </span>
              ) : (
                <span className="text-mode-warn">Needs test</span>
              )}
            </EvidenceFactRow>
          ) : null}
          {row.label_printed_at ? <EvidenceFactRow label="Label">Printed {stamp(row.label_printed_at)}</EvidenceFactRow> : null}
          {row.received_done_at ? <EvidenceFactRow label="Received">{stamp(row.received_done_at)}</EvidenceFactRow> : null}
          {bin ? (
            <EvidenceFactRow label="Put away">
              <span>
                <span className={RECORD_ID_CLASS}>{bin}</span>
                {row.staged_at ? <Muted> · {[row.staged_by_name, stamp(row.staged_at)].filter(Boolean).join(' · ')}</Muted> : null}
              </span>
            </EvidenceFactRow>
          ) : null}
          {ticket ? (
            <EvidenceFactRow label="Claim">
              <TicketLink ticket={ticket} />
            </EvidenceFactRow>
          ) : null}
          {note ? <EvidenceFactRow label="Item note" wide>{note}</EvidenceFactRow> : null}
        </div>
      ) : null}
      {description ? <p className="whitespace-pre-wrap px-4 pb-3 text-role-data text-mode-muted">{description}</p> : null}
    </article>
  );
}

/** The right column — facts and the note. Verbs live on the ledger's action strip. */
export function IncomingRecordAside({ row, data }: { row: ReceivingLineRow; data: DetailsResponse }) {
  const po = data.po?.zoho_purchaseorder_number || row.zoho_purchaseorder_number || null;
  const orderRef = data.inbound?.order_number || row.source_order_id || null;
  const listing = data.inbound?.listing_url || row.listing_url || row.receiving_listing_url || null;
  const tracking = (data.shipment?.tracking_number || row.tracking_number || data.inbound?.tracking_number || '').trim() || null;
  const carrier = data.shipment?.carrier || row.carrier || null;
  const bin = (row.staged_location_code || row.staged_location_name || row.staging_location_label || '').trim() || null;
  const ticket = (row.zendesk_ticket || '').trim() || null;

  return (
    <div className={CARTON_COLUMN_CLASS}>
      <CartonColumnHead label="Purchase" />
      <div className="flex flex-col px-4" data-testid="incoming-record-purchase">
        <EvidenceFactRow label="Source">
          <span className={RECORD_ID_CLASS}>{(data.inbound?.source_type || row.inbound_source_type || row.source_platform || 'zoho').toUpperCase()}</span>
        </EvidenceFactRow>
        {po ? (
          <EvidenceFactRow label="PO">
            <span className={cn(RECORD_ID_CLASS, 'select-all')}>{po}</span>
          </EvidenceFactRow>
        ) : null}
        {orderRef ? (
          <EvidenceFactRow label="Order #">
            <span className={cn(RECORD_ID_CLASS, 'select-all')}>{orderRef}</span>
          </EvidenceFactRow>
        ) : null}
        <EvidenceFactRow label="Vendor">
          {data.po?.vendor_name || data.inbound?.seller_name || row.vendor_name || <Muted>Unknown</Muted>}
        </EvidenceFactRow>
        {data.inbound?.account_label || row.platform_account_label ? (
          <EvidenceFactRow label="Account">{data.inbound?.account_label || row.platform_account_label}</EvidenceFactRow>
        ) : null}
        {data.po?.status || data.inbound?.status ? (
          <EvidenceFactRow label="Status">{data.po?.status || data.inbound?.status}</EvidenceFactRow>
        ) : null}
        {data.po?.reference_number ? (
          <EvidenceFactRow label="Reference">
            <span className={RECORD_ID_CLASS}>{data.po.reference_number}</span>
          </EvidenceFactRow>
        ) : null}
        {data.po?.expected_delivery_date || row.expected_delivery_date ? (
          <EvidenceFactRow label="Expected">
            <span className={RECORD_ID_CLASS}>{fmtDate(data.po?.expected_delivery_date || row.expected_delivery_date)}</span>
          </EvidenceFactRow>
        ) : null}
        {data.po?.total ? (
          <EvidenceFactRow label="Total">
            <span className={RECORD_PRICE_CLASS}>{fmtMoney(data.po.total, data.po.currency)}</span>
          </EvidenceFactRow>
        ) : null}
        {listing ? (
          <EvidenceFactRow label="Listing">
            <a
              href={listing}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('inline-flex items-center gap-1 underline decoration-mode-edge underline-offset-2', focusRing('control'))}
            >
              Open listing <ExternalLink aria-hidden className="h-3 w-3" />
            </a>
          </EvidenceFactRow>
        ) : null}
        {data.inbound?.links.length
          ? data.inbound.links.map((link) => (
              <EvidenceFactRow key={`${link.source_type}:${link.source_order_id}`} label={link.is_primary ? 'Primary' : 'Linked'}>
                <span className={RECORD_ID_CLASS}>
                  {link.source_type.toUpperCase()} · {link.source_order_id}
                </span>
              </EvidenceFactRow>
            ))
          : null}
      </div>

      {data.inbound ? (
        <>
          <CartonColumnHead label="Marketplace" />
          <div className="px-4 py-3">
            <EbayTab data={data} />
          </div>
        </>
      ) : null}

      <CartonColumnHead label="Shipment" />
      <div className="flex flex-col px-4" data-testid="incoming-record-shipment">
        <EvidenceFactRow label="TRK#">
          {tracking ? (
            <TrackingIdentity tracking={tracking} carrierHint={carrier} />
          ) : (
            <span className={cn(RECORD_ID_CLASS, 'text-mode-warn')}>NOT ATTACHED</span>
          )}
        </EvidenceFactRow>
        {data.shipment?.latest_status_category || row.shipment_status ? (
          <EvidenceFactRow label="Carrier">
            {(data.shipment?.latest_status_category || row.shipment_status || '').replaceAll('_', ' ').toLowerCase()}
          </EvidenceFactRow>
        ) : null}
        <CartonStampFact label="Delivered" at={data.shipment?.delivered_at ?? row.delivered_at} />
        <CartonStampFact label="Door scan" who={row.received_by_name} at={data.receiving?.received_at ?? row.received_at} />
        <CartonStampFact label="Last check" at={data.shipment?.last_checked_at ?? row.shipment_last_checked_at} />
        {bin ? (
          <EvidenceFactRow label="Location">
            <span className={RECORD_ID_CLASS}>{bin}</span>
          </EvidenceFactRow>
        ) : null}
        {ticket ? (
          <EvidenceFactRow label="Ticket">
            <TicketLink ticket={ticket} />
          </EvidenceFactRow>
        ) : null}
      </div>

      <CartonColumnHead label="Notes" />
      <div className="flex flex-col gap-2 px-4 py-3" data-testid="incoming-record-notes">
        {row.notes ? <p className="whitespace-pre-wrap text-role-data">Line note: {row.notes}</p> : null}
        {data.po_notes ? <p className="whitespace-pre-wrap text-role-data text-mode-muted">PO: {data.po_notes}</p> : null}
        <NotesTab receivingId={data.receiving?.id ?? null} initialValue={data.notes ?? ''} />
      </div>
    </div>
  );
}
