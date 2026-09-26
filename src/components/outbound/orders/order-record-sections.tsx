'use client';

/** The order record's self-contained sections — each one fetches or reads what it paints, so {@link OrderRecordView} only composes them per… */

import { useState } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { DESK_BAR_SEGMENT_CLASS, deskBarSegmentTone } from '@/design-system/components/DeskActionSlot';
import { Printer } from '@/components/Icons';
import {
  customerAddressLines,
  customerBillToLines,
  customerFullName,
  customerPhone,
  type CustomerBillTo,
  type CustomerRecord,
} from '@/lib/customers/customer-display';
import { outboundDocumentContentSrc } from '@/lib/documents/outbound-document-display';
import { EvidenceDisclosure, EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import type { OrderLabelStatus } from '@/lib/shipping/order-label-summary';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import {
  pickOrderDocument,
  printDocument,
  useOrderDocuments,
  useOrderLabelSummary,
} from '@/lib/orders/order-paperwork-client';
import { OrderLabelEntries } from './OrderLabelEntries';
import { LedgerStageAssign, stageFacts } from './outbound-orders-ledger-editors';
import { resolveOrdersSlotValue } from '@/lib/tables/field-catalog/orders-resolve';
import { formatMonthDayTimePST } from '@/utils/date';

/** How each label status reads in the record (mono-caps code, its tone, why). */
const LABEL_STATUS_FACE: Readonly<Record<OrderLabelStatus, { label: string; tone: string; tip: string }>> = {
  none: { label: 'None', tone: 'text-mode-warn', tip: 'No shipping label on this order yet.' },
  bought: { label: 'Bought', tone: STATE_TONE_CLASSES.success.text, tip: 'Label bought through ShipStation.' },
  pending: {
    label: 'Unresolved',
    tone: STATE_TONE_CLASSES.danger.text,
    tip: 'A purchase started and never finished — check ShipStation before buying again.',
  },
  linked: { label: 'Linked', tone: 'text-mode-ink', tip: 'A label is attached to this order; it was not bought here.' },
  voided: { label: 'Voided', tone: 'text-mode-muted', tip: 'The last label was voided and nothing has replaced it.' },
};

/** The order's labels: */
export function OrderLabelsSection({ orderId, orderRef, entries }: { orderId: number; orderRef: string; entries: boolean }) {
  const summaryQuery = useOrderLabelSummary(orderId);
  const documentsQuery = useOrderDocuments(orderId);
  const summary = summaryQuery.data ?? null;
  const purchase = summary?.purchase ?? null;
  const labels = summary?.labels ?? [];
  const face = summary ? LABEL_STATUS_FACE[summary.status] : null;
  const documents = documentsQuery.data?.documents ?? [];
  const labelSrc = outboundDocumentContentSrc(
    pickOrderDocument(documents, 'shipping_label', purchase?.labelDocumentId ?? null),
  );
  const slipSrc = outboundDocumentContentSrc(pickOrderDocument(documents, 'packing_slip', null));

  return (
    <EvidenceDisclosure
      label={entries && labels.length > 1 ? `Labels · ${labels.length}` : entries ? 'Labels' : 'Label'}
      testId="evidence-label"
      summary={
        <span
          data-testid="evidence-label-status"
          title={summaryQuery.isError ? summaryQuery.error.message : face?.tip}
          className={cn(RECORD_LABEL_CLASS, summaryQuery.isError ? 'text-mode-warn' : (face?.tone ?? 'text-mode-muted'))}
        >
          {summaryQuery.isError ? 'Unreadable' : (face?.label ?? '…')}
        </span>
      }
    >
      {summary?.status === 'pending' ? (
        <p className={cn(RECORD_LABEL_CLASS, 'border-b border-mode-edge px-4 py-2', STATE_TONE_CLASSES.danger.text)}>
          {LABEL_STATUS_FACE.pending.tip}
        </p>
      ) : null}
      {entries ? <OrderLabelEntries orderId={orderId} orderRef={orderRef} labels={labels} documents={documents} /> : null}
      <div className="flex items-stretch border-t border-mode-edge bg-mode-bar" data-testid="evidence-label-print">
        <button
          type="button"
          disabled={!labelSrc}
          title={labelSrc ? 'Print the stored shipping label' : 'No shipping label stored on this order'}
          data-testid="evidence-print-label"
          className={cn(DESK_BAR_SEGMENT_CLASS, 'flex-1 justify-center border-r border-mode-edge', deskBarSegmentTone(false))}
          onClick={() => labelSrc && printDocument(labelSrc)}
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print label
        </button>
        <button
          type="button"
          disabled={!slipSrc}
          title={slipSrc ? 'Print the stored packing slip' : 'No packing slip stored on this order'}
          data-testid="evidence-print-slip"
          className={cn(DESK_BAR_SEGMENT_CLASS, 'flex-1 justify-center', deskBarSegmentTone(false))}
          onClick={() => slipSrc && printDocument(slipSrc)}
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print slip
        </button>
      </div>
    </EvidenceDisclosure>
  );
}

/**
 * A ShipStation ship-to (`shipstation_order_refs.ship_to`) as the book's DTO,
 * so an order with no customer-book buyer reads through the same readers.
 */
function shipToCustomer(shipTo: CustomerBillTo): CustomerRecord {
  return {
    id: 0,
    display_name: shipTo.name ?? null,
    customer_name: shipTo.company ?? null,
    first_name: null,
    last_name: null,
    email: null,
    phone: shipTo.phone ?? null,
    mobile: null,
    shipping_address_1: shipTo.address1 ?? null,
    shipping_address_2: shipTo.address2 ?? null,
    shipping_city: shipTo.city ?? null,
    shipping_state: shipTo.state ?? null,
    shipping_postal_code: shipTo.postalCode ?? null,
    shipping_country: shipTo.country ?? null,
    billing_address: null,
  };
}

/**
 * The order's buyer: the customer-book row (`orders.customer_id → customers`,
 * joined by `/api/orders`), else its ShipStation order's ship-to. Null when
 * the order carries neither.
 */
export function orderBuyer(record: ShippedOrder): { customer: CustomerRecord; source?: string } | null {
  if (record.customer) return { customer: record.customer };
  if (record.customer_id == null && record.shipstation_ship_to) {
    return { customer: shipToCustomer(record.shipstation_ship_to), source: 'ShipStation' };
  }
  return null;
}

/** The buyer as one collapsible section: */
export function OrderCustomerSection({ customer, source }: { customer: CustomerRecord; source?: string }) {
  const [copied, setCopied] = useState(false);
  const name = customerFullName(customer);
  const email = String(customer.email ?? '').trim();
  const phone = customerPhone(customer);
  const shipTo = customerAddressLines(customer);
  const billTo = customerBillToLines(customer);
  if (!name && !email && !phone && shipTo.length === 0) return null;

  const copyAddress = () => {
    void navigator.clipboard.writeText([name, ...shipTo].filter(Boolean).join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <EvidenceDisclosure
      label="Customer"
      testId="evidence-customer"
      summary={
        <span className={cn(RECORD_ID_CLASS, 'truncate text-mode-ink')} title={name || undefined}>
          {name || source || 'details'}
        </span>
      }
    >
      <div className="flex flex-col px-4">
        {source ? (
          <EvidenceFactRow label="Source">
            <span className={RECORD_LABEL_CLASS}>{source}</span>
          </EvidenceFactRow>
        ) : null}
        {name ? (
          <EvidenceFactRow label="Name">
            <span className="block truncate font-bold" title={name}>{name}</span>
          </EvidenceFactRow>
        ) : null}
        {email ? (
          <EvidenceFactRow label="Email">
            <a
              href={`mailto:${email}`}
              title={email}
              className={cn('block truncate underline decoration-mode-edge underline-offset-2 hover:decoration-mode-ink', focusRing('control'))}
            >
              {email}
            </a>
          </EvidenceFactRow>
        ) : null}
        {phone ? (
          <EvidenceFactRow label="Phone">
            <span className={cn(RECORD_ID_CLASS, 'select-all')}>{phone}</span>
          </EvidenceFactRow>
        ) : null}
        {shipTo.length > 0 ? (
          <EvidenceFactRow label="Ship to" wide>
            <span className="block select-all whitespace-pre-line break-words">{shipTo.join('\n')}</span>
          </EvidenceFactRow>
        ) : null}
        {billTo.length > 0 ? (
          <EvidenceFactRow label="Bill to" wide>
            <span className="block select-all whitespace-pre-line break-words">{billTo.join('\n')}</span>
          </EvidenceFactRow>
        ) : null}
      </div>
      {shipTo.length > 0 ? (
        <div className="flex items-stretch bg-mode-bar">
          <button
            type="button"
            data-testid="evidence-customer-copy-address"
            title="Copy the name and ship-to address"
            className={cn(DESK_BAR_SEGMENT_CLASS, 'flex-1 justify-center', deskBarSegmentTone(false))}
            onClick={copyAddress}
          >
            {copied ? 'Copied' : 'Copy address'}
          </button>
        </div>
      ) : null}
    </EvidenceDisclosure>
  );
}

/**
 * The shipment after it left (Shipped mode): who scanned it out at the dock
 * and when (`orders.scanned_out`, the SHIP_CONFIRM stamp), the carrier, and
 * the carrier's latest tracking status off `shipping_tracking_numbers`.
 */
export function OrderShipmentSection({ record }: { record: ShippedOrder }) {
  const scanned = stageFacts(resolveOrdersSlotValue(record, 'orders.scanned_out'));
  const carrier = String(record.carrier ?? '').trim() || null;
  const status = String(record.latest_status_label ?? '').trim() || null;
  const detail = String(record.latest_status_description ?? '').trim() || null;
  const eventAt = record.latest_event_at ? formatMonthDayTimePST(record.latest_event_at) : null;
  const statusLine = [detail, eventAt].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-col border-b border-mode-ink px-4" data-testid="order-record-shipment">
      <EvidenceFactRow label="Scanned out">
        <LedgerStageAssign
          verb="Scan out"
          doneVerb="Scanned out"
          role="packer"
          facts={scanned}
          selectedStaffId={null}
          assignedName="---"
          showStamp
        />
      </EvidenceFactRow>
      <EvidenceFactRow label="Carrier">
        <span className={cn(RECORD_ID_CLASS, carrier ? 'text-mode-ink' : 'text-mode-muted')}>{carrier ?? '—'}</span>
      </EvidenceFactRow>
      <EvidenceFactRow label="Tracking">
        <span className="flex min-w-0 flex-col py-1" data-testid="order-record-tracking-status">
          <span
            className={cn(
              RECORD_LABEL_CLASS,
              record.has_exception ? 'text-mode-warn' : status ? 'text-mode-ink' : 'text-mode-muted',
            )}
          >
            {status ?? 'No carrier scan yet'}
          </span>
          {statusLine ? <span className="truncate text-role-caption text-mode-muted">{statusLine}</span> : null}
        </span>
      </EvidenceFactRow>
    </div>
  );
}
