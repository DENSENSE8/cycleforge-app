'use client';

/** The order record's self-contained sections — each one fetches or reads what it paints, so {@link OrderRecordView} only composes them per… */

import { useState, type FormEvent } from 'react';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { Check, Copy, MapPin, Pencil, Plus, Truck } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  customerAddressLines,
  customerBillToLines,
  customerFullName,
  customerPhone,
  type CustomerBillTo,
  type CustomerRecord,
} from '@/lib/customers/customer-display';
import { EvidenceDisclosure } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import type { OrderLabelStatus } from '@/lib/shipping/order-label-summary';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_LABEL_CLASS, RECORD_TRAILING_ACTION_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';
import { useOrderDocuments, useOrderLabelSummary } from '@/lib/orders/order-paperwork-client';
import { OrderLabelEntries } from './OrderLabelEntries';
import { LedgerCopyAction, LedgerOpenAction } from './outbound-orders-ledger-editors';
import { RecordFullId } from '@/design-system/components/record-ledger/RecordFullId';
import { formatPhoneNumber } from '@/utils/phone';
import { CustomerOrderStats } from './facts/CustomerOrderStats';
import { AddressCheckBadge, useAddressSuggestion, type AddressCheckResult } from './facts/AddressCheck';
import type { ShipAddress } from '@/lib/shipping/shipstation/types';
import { formatMonthDayTimePST } from '@/utils/date';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button, TextField } from '@/design-system/primitives';
import { patchOrderBuyer } from '@/lib/orders/order-buyer-client';
import { toast } from '@/lib/toast';

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
 * The Customer group (owner 2026-09-27): contact read-out, ONE Edit top-right.
 * Edit writes name / email / phone through the order-scoped
 * `PATCH /api/orders/[id]/buyer` (`orders.create`, the desks' write
 * permission). A ShipStation-only buyer has no customer row yet — the route
 * creates one from the ship-to and links the order's lines.
 */
export function OrderCustomerGroup({
  orderId,
  customer,
  source,
}: {
  orderId: number;
  customer: CustomerRecord;
  source?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', phone: '' });

  const startEdit = () => {
    setDraft({
      name: customerFullName(customer),
      email: String(customer.email ?? '').trim(),
      phone: customerPhone(customer) ?? '',
    });
    setEditing(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const body: { name?: string; email?: string; phone?: string } = {};
    if (draft.name.trim() && draft.name.trim() !== customerFullName(customer)) body.name = draft.name.trim();
    if (draft.email.trim() !== String(customer.email ?? '').trim()) body.email = draft.email.trim();
    if (draft.phone.trim() !== (customerPhone(customer) ?? '')) body.phone = draft.phone.trim();
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await patchOrderBuyer(orderId, body);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Customer saved');
    setEditing(false);
  };

  return (
    <RecordGroup
      title="Customer"
      testId="order-record-customer"
      action={
        !editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={startEdit} data-testid="order-record-customer-edit">
            Edit
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <form className="flex flex-col gap-2 px-4 pb-3 pt-1" onSubmit={save} data-testid="order-record-customer-form">
          <TextField label="Name" value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} autoFocus />
          <TextField label="Email" type="email" value={draft.email} onChange={(email) => setDraft((d) => ({ ...d, email }))} />
          <TextField label="Phone" type="tel" value={draft.phone} onChange={(phone) => setDraft((d) => ({ ...d, phone }))} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Save
            </Button>
          </div>
        </form>
      ) : (
        <OrderCustomerRows customer={customer} source={source} orderId={orderId} />
      )}
    </RecordGroup>
  );
}

/**
 * The ship-to while Shipping is in Edit (owner 2026-09-27: "the customer typed
 * the wrong address / calls to change it"). Saves the COMPLETE corrected
 * address through `PATCH /api/orders/[id]/buyer`; the route stamps it as a
 * staff correction, so labels buy to it over ShipStation's copy.
 */
export function OrderShipToEditor({ orderId, customer }: { orderId: number; customer: CustomerRecord | null }) {
  const initial = {
    address1: String(customer?.shipping_address_1 ?? '').trim(),
    address2: String(customer?.shipping_address_2 ?? '').trim(),
    city: String(customer?.shipping_city ?? '').trim(),
    state: String(customer?.shipping_state ?? '').trim(),
    postalCode: String(customer?.shipping_postal_code ?? '').trim(),
    country: String(customer?.shipping_country ?? '').trim() || 'US',
  };
  const [draft, setDraft] = useState(initial);
  // No buyer on file at all: the route creates one, and a buyer needs a name.
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  // The carrier's corrected address, offered once before saving what was typed.
  const [suggestion, setSuggestion] = useState<AddressCheckResult | null>(null);
  const check = useAddressSuggestion();
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((key) => draft[key].trim() !== initial[key]);
  const set = (key: keyof typeof initial) => (value: string) => {
    setSuggestion(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const write = async (shipTo: typeof initial) => {
    setSaving(true);
    const result = await patchOrderBuyer(orderId, customer ? { shipTo } : { name: name.trim() || undefined, shipTo });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSuggestion(null);
    toast.success('Ship-to saved');
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!dirty) return;
    // Address check first: a verified (or uncheckable) address saves straight through.
    if (!suggestion) {
      const result = await check.validate(shipAddressFromDraft(draft, name.trim() || (customer ? customerFullName(customer) : '')));
      if ((result.status === 'unverified' || result.status === 'warning') && result.matched) {
        setSuggestion(result);
        return;
      }
    }
    await write(draft);
  };

  const useSuggested = () => {
    const matched = suggestion?.matched;
    if (!matched) return;
    const next = {
      address1: matched.addressLine1 ?? '',
      address2: matched.addressLine2 ?? '',
      city: matched.cityLocality ?? '',
      state: matched.stateProvince ?? '',
      postalCode: matched.postalCode ?? '',
      country: matched.countryCode ?? draft.country,
    };
    setDraft(next);
    void write(next);
  };

  return (
    <form className="flex flex-col gap-2 border-b border-mode-fact py-2" onSubmit={save} data-testid="order-record-ship-to-form">
      <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Ship to</span>
      {customer ? null : <TextField label="Recipient name" value={name} onChange={setName} autoFocus />}
      <TextField label="Address" value={draft.address1} onChange={set('address1')} autoFocus={Boolean(customer)} />
      <TextField label="Apt, suite (optional)" value={draft.address2} onChange={set('address2')} />
      <div className="grid grid-cols-[1fr_5rem_6rem] gap-2">
        <TextField label="City" value={draft.city} onChange={set('city')} />
        <TextField label="State" value={draft.state} onChange={set('state')} />
        <TextField label="ZIP" value={draft.postalCode} onChange={set('postalCode')} />
      </div>
      <TextField label="Country" value={draft.country} onChange={set('country')} />
      {suggestion?.matched ? (
        <div className="flex flex-col gap-1 rounded-mode-control border border-mode-edge bg-mode-well p-2" data-testid="order-record-ship-to-suggestion">
          <span className="text-role-caption text-mode-warn">
            {suggestion.messages[0] ?? 'The carrier could not verify this address.'}
          </span>
          <span className="whitespace-pre-line text-role-data text-mode-ink">
            {[
              suggestion.matched.addressLine1,
              suggestion.matched.addressLine2,
              [suggestion.matched.cityLocality, suggestion.matched.stateProvince, suggestion.matched.postalCode].filter(Boolean).join(' '),
            ]
              .filter(Boolean)
              .join('\n')}
          </span>
          <span className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => void write(draft)} disabled={saving}>
              Save as typed
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={useSuggested} loading={saving}>
              Use suggested
            </Button>
          </span>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm" loading={saving || check.pending} disabled={!dirty}>
            Save address
          </Button>
        </div>
      )}
    </form>
  );
}

/**
 * The Customer group's body — WHO bought (owner 2026-09-27). A storefront
 * customer card: the values read as what they are, so no Name / Email / Phone
 * captions — the name, the email (mailto + copy), the phone (`tel:` + copy),
 * then the billing address (the one fact that needs its caption: it is not
 * where the parcel goes — that is the Shipping group's `OrderShipToRow`).
 */
export function OrderCustomerRows({ customer, source, orderId }: { customer: CustomerRecord; source?: string; orderId: number }) {
  const name = customerFullName(customer);
  const email = String(customer.email ?? '').trim();
  const phone = customerPhone(customer);
  const billTo = customerBillToLines(customer);
  return (
    <div className="flex flex-col gap-0.5 px-4 pb-3" data-testid="evidence-customer">
      <p className="truncate text-role-data font-semibold text-mode-ink" title={name || undefined}>
        {name || '—'}
      </p>
      {/* Order count · total spent — only for a customer-book buyer (a ShipStation ship-to has no history). */}
      <CustomerOrderStats customerId={source ? null : customer.id} currentOrderId={orderId} />
      {email ? (
        <span className="flex min-h-7 min-w-0 items-center">
          <a
            href={`mailto:${email}`}
            title={email}
            className={cn(
              'block min-w-0 flex-1 truncate text-role-data text-mode-ink no-underline decoration-mode-edge underline-offset-2 hover:underline',
              focusRing('control'),
            )}
          >
            {email}
          </a>
          <LedgerCopyAction value={email} label="email" />
        </span>
      ) : null}
      {phone ? (
        <span className="flex min-h-7 min-w-0 items-center">
          <a
            href={`tel:${phone.replace(/[^\d+]/g, '')}`}
            className={cn(
              'block min-w-0 flex-1 truncate text-role-data tabular-nums text-mode-ink no-underline decoration-mode-edge underline-offset-2 hover:underline',
              focusRing('control'),
            )}
          >
            {formatPhoneNumber(phone)}
          </a>
          <LedgerCopyAction value={phone} label="phone" />
        </span>
      ) : null}
      {billTo.length > 0 ? (
        <div className="mt-2 flex flex-col gap-0.5 border-t border-mode-fact pt-2">
          <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Billing address</span>
          <span className="block select-all whitespace-pre-line break-words text-role-data text-mode-ink">{billTo.join('\n')}</span>
        </div>
      ) : null}
      {source ? <p className="mt-1 text-role-caption text-mode-muted">From {source}</p> : null}
    </div>
  );
}

/** Where the parcel goes — the recipient and address as a postal block (no caption), copy + map beside it. */
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
    <div className="flex min-w-0 items-start gap-2" data-testid="order-record-ship-to">
      <address className="block min-w-0 flex-1 select-all whitespace-pre-line break-words text-role-data not-italic text-mode-ink">
        {name ? <span className="font-semibold">{name}</span> : null}
        {name ? '\n' : null}
        {shipTo.join('\n')}
      </address>
      <span className="flex shrink-0 items-center gap-0.5">
        {/* Nothing when the carrier verifies it; a warn mark before a label is bought when not. */}
        <AddressCheckBadge customer={customer} />
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
    </div>
  );
}

/**
 * How the parcel travels — one line led by a truck: carrier · tracking number
 * (opens the carrier page), no "Tracking #" caption, and — where the desk may
 * change it — ONE always-visible verb: **Replace** (a voided label's number
 * gives way to the new one) or **Add tracking** when there is none. With
 * `withStatus` (the shipped archive) the carrier's latest scan off
 * `shipping_tracking_numbers` reads under it.
 */
export function OrderTrackingLine({
  record,
  tracking,
  carrier,
  href,
  withStatus,
  onReplace,
}: {
  record: ShippedOrder;
  tracking: string | null;
  carrier: string | null;
  href: string | null;
  withStatus: boolean;
  /** Present ⇒ the desk may set the number: Replace / Add tracking opens the field in place. */
  onReplace?: () => void;
}) {
  const carrierName = carrier || String(record.carrier ?? '').trim() || null;
  const status = String(record.latest_status_label ?? '').trim() || null;
  const detail = String(record.latest_status_description ?? '').trim() || null;
  const eventAt = record.latest_event_at ? formatMonthDayTimePST(record.latest_event_at) : null;
  const statusLine = [detail, eventAt].filter(Boolean).join(' · ');
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-t border-mode-fact pt-2">
      <span className="flex min-h-8 min-w-0 items-center gap-2" data-testid="evidence-tracking-chip">
        <Truck aria-hidden className="size-4 shrink-0 text-mode-muted" />
        {carrierName ? <span className="shrink-0 text-role-data font-semibold text-mode-ink">{carrierName}</span> : null}
        <span className="flex min-w-0 flex-1 items-center">
          {tracking ? (
            <RecordFullId value={tracking} label="tracking number" />
          ) : (
            <span className="text-role-data text-mode-warn">No tracking yet</span>
          )}
        </span>
        {/* Icon first, pencil BEFORE ↗ (owner 2026-09-27): edit the number, then open it. */}
        {onReplace ? (
          <HoverTooltip label={tracking ? 'Replace tracking number' : 'Add tracking number'} asChild placement="above">
            <button
              type="button"
              onClick={onReplace}
              aria-label={tracking ? 'Replace tracking number' : 'Add tracking number'}
              data-testid="order-record-tracking-replace"
              className={cn(ADDRESS_ACTION_CLASS, focusRing('control'))}
            >
              {tracking ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
            </button>
          </HoverTooltip>
        ) : null}
        {tracking ? <LedgerOpenAction href={href} label="tracking number" /> : null}
      </span>
      {withStatus ? (
        <span className="flex min-w-0 flex-col pl-6" data-testid="order-record-tracking-status">
          <span className={cn('text-role-data font-medium', record.has_exception ? 'text-mode-warn' : status ? 'text-mode-ink' : 'text-mode-muted')}>
            {status ?? 'No carrier scan yet'}
          </span>
          {statusLine ? <span className="truncate text-role-caption text-mode-muted">{statusLine}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

/** The editor's draft as the carrier's address shape, for the pre-save check. */
function shipAddressFromDraft(
  draft: { address1: string; address2: string; city: string; state: string; postalCode: string; country: string },
  name: string,
): ShipAddress {
  return {
    name: name.trim() || 'Recipient',
    phone: null,
    company: null,
    addressLine1: draft.address1.trim(),
    addressLine2: draft.address2.trim() || null,
    cityLocality: draft.city.trim(),
    stateProvince: draft.state.trim(),
    postalCode: draft.postalCode.trim(),
    countryCode: (draft.country.trim() || 'US').toUpperCase(),
    residential: true,
  };
}
