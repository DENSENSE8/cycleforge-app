'use client';

/** The order record's self-contained sections — each one fetches or reads what it paints, so {@link OrderRecordView} only composes them per… */

import { useState } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { Check, Copy, MapPin } from '@/components/Icons';
import {
  customerAddressLines,
  customerBillToLines,
  customerFullName,
  customerPhone,
  type CustomerBillTo,
  type CustomerRecord,
} from '@/lib/customers/customer-display';
import { EvidenceDisclosure, EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import type { OrderLabelStatus } from '@/lib/shipping/order-label-summary';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_TRAILING_ACTION_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import { useOrderDocuments, useOrderLabelSummary } from '@/lib/orders/order-paperwork-client';
import { OrderLabelEntries } from './OrderLabelEntries';
import { LedgerCopyAction } from './outbound-orders-ledger-editors';
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

/** The order's label history (Shipped / Search): status + every label. Viewing and printing are the Label action, not this read-out. */
export function OrderLabelsSection({ orderId, orderRef }: { orderId: number; orderRef: string }) {
  const summaryQuery = useOrderLabelSummary(orderId);
  const documentsQuery = useOrderDocuments(orderId);
  const summary = summaryQuery.data ?? null;
  const labels = summary?.labels ?? [];
  const face = summary ? LABEL_STATUS_FACE[summary.status] : null;
  const documents = documentsQuery.data?.documents ?? [];

  return (
    <EvidenceDisclosure
      label={labels.length > 1 ? `Labels · ${labels.length}` : 'Labels'}
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
      <OrderLabelEntries orderId={orderId} orderRef={orderRef} labels={labels} documents={documents} />
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

/** A small icon action on a fact value (copy address, map lookup). */
const ADDRESS_ACTION_CLASS = cn('ds-raw-button', RECORD_TRAILING_ACTION_CLASS);

/**
 * The Customer group's rows — WHO bought (owner 2026-09-27): name, email
 * (mailto + copy), phone (`tel:` + copy), bill-to. Always open; where the
 * parcel goes is the Shipping group's (`OrderShipToRow`).
 */
export function OrderCustomerRows({ customer, source }: { customer: CustomerRecord; source?: string }) {
  const name = customerFullName(customer);
  const email = String(customer.email ?? '').trim();
  const phone = customerPhone(customer);
  const billTo = customerBillToLines(customer);
  return (
    <div className="flex flex-col px-4" data-testid="evidence-customer">
      <EvidenceFactRow label="Name">
        <span className="truncate text-role-data text-mode-ink" title={name || undefined}>
          {name || '—'}
        </span>
      </EvidenceFactRow>
      {email ? (
        <EvidenceFactRow label="Email">
          <span className="flex min-w-0 flex-1 items-center">
            <a
              href={`mailto:${email}`}
              title={email}
              className={cn('block min-w-0 flex-1 truncate underline decoration-mode-edge underline-offset-2 hover:decoration-mode-ink', focusRing('control'))}
            >
              {email}
            </a>
            <LedgerCopyAction value={email} label="email" />
          </span>
        </EvidenceFactRow>
      ) : null}
      {phone ? (
        <EvidenceFactRow label="Phone">
          <span className="flex min-w-0 flex-1 items-center">
            <a
              href={`tel:${phone.replace(/[^\d+]/g, '')}`}
              className={cn(RECORD_ID_CLASS, 'block min-w-0 flex-1 truncate no-underline hover:underline', focusRing('control'))}
            >
              {phone}
            </a>
            <LedgerCopyAction value={phone} label="phone" />
          </span>
        </EvidenceFactRow>
      ) : null}
      {billTo.length > 0 ? (
        <EvidenceFactRow label="Bill to" wide>
          <span className="block select-all whitespace-pre-line break-words">{billTo.join('\n')}</span>
        </EvidenceFactRow>
      ) : null}
      {source ? (
        <EvidenceFactRow label="Source">
          <span className={RECORD_LABEL_CLASS}>{source}</span>
        </EvidenceFactRow>
      ) : null}
    </div>
  );
}

/** Where the parcel goes — the Shipping group's first row: the address with copy + map on it. */
export function OrderShipToRow({ customer }: { customer: CustomerRecord }) {
  const [copied, setCopied] = useState(false);
  const name = customerFullName(customer);
  const shipTo = customerAddressLines(customer);
  if (shipTo.length === 0) return null;
  const copyAddress = () => {
    void navigator.clipboard.writeText([name, ...shipTo].filter(Boolean).join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <EvidenceFactRow label="Ship to" wide>
      <span className="flex min-w-0 items-start gap-2">
        <span className="block min-w-0 flex-1 select-all whitespace-pre-line break-words">{shipTo.join('\n')}</span>
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            data-testid="evidence-customer-copy-address"
            title={copied ? 'Copied' : 'Copy name and address'}
            aria-label={copied ? 'Copied' : 'Copy name and address'}
            onClick={copyAddress}
            className={cn(ADDRESS_ACTION_CLASS, focusRing('control'))}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shipTo.join(', '))}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="evidence-customer-map"
            title="Look up the address in Google Maps"
            aria-label="Look up the address in Google Maps"
            className={cn(ADDRESS_ACTION_CLASS, focusRing('control'))}
          >
            <MapPin className="size-3.5" />
          </a>
        </span>
      </span>
    </EvidenceFactRow>
  );
}

/**
 * The carrier's side of the Shipping group: carrier and its latest tracking
 * status off `shipping_tracking_numbers` (the tracking NUMBER is its own row).
 */
export function OrderCarrierRows({ record }: { record: ShippedOrder }) {
  const carrier = String(record.carrier ?? '').trim() || null;
  const status = String(record.latest_status_label ?? '').trim() || null;
  const detail = String(record.latest_status_description ?? '').trim() || null;
  const eventAt = record.latest_event_at ? formatMonthDayTimePST(record.latest_event_at) : null;
  const statusLine = [detail, eventAt].filter(Boolean).join(' · ');
  return (
    <>
      <EvidenceFactRow label="Carrier">
        <span className={cn(RECORD_ID_CLASS, carrier ? 'text-mode-ink' : 'text-mode-muted')}>{carrier ?? '—'}</span>
      </EvidenceFactRow>
      <EvidenceFactRow label="Status">
        <span className="flex min-w-0 flex-col py-1" data-testid="order-record-tracking-status">
          <span className={cn(RECORD_LABEL_CLASS, record.has_exception ? 'text-mode-warn' : status ? 'text-mode-ink' : 'text-mode-muted')}>
            {status ?? 'No carrier scan yet'}
          </span>
          {statusLine ? <span className="truncate text-role-caption text-mode-muted">{statusLine}</span> : null}
        </span>
      </EvidenceFactRow>
    </>
  );
}
