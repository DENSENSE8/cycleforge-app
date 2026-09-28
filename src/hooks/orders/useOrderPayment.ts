'use client';

/**
 * How the customer pays for a sales order — the non-rendering half shared by
 * the desk (`IntakePaymentFields`) and the phone (`MobilePaymentStep`).
 *
 * Card numbers never touch CycleForge. A link / invoice hands the caller a
 * provider-hosted page (`/api/orders/payments`); "In person" records a payment
 * already taken on the counter reader (or cash / check / Zelle) as its FACTS
 * only — brand, last 4, how the card met the reader, the authorization code
 * (`@/lib/order-payments/tender`). Only the providers this org has connected
 * are offered (`/api/orders/payments/methods`); in person is always offered,
 * first for a pickup. An unsaved order is saved as a draft first
 * (`onEnsureSaved`) — one press.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  looksLikePan,
  parseInPersonTender,
  tenderSummary,
  type CardBrand,
  type CardEntryMethod,
  type TenderType,
} from '@/lib/order-payments/tender';
import { priceCents, type IntakeShippingMode } from '@/lib/orders/intake/intake-model';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { SquareInvoiceImport, SquarePaymentFacts } from '@/lib/orders/square-invoice-import-core';
import { toast } from '@/lib/toast';

export type PaymentMethod = 'square_link' | 'square_invoice' | 'stripe_link' | 'in_person';

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
}

const PROVIDER_METHODS: ReadonlyArray<PaymentMethodOption & { provider: 'square' | 'stripe' }> = [
  { value: 'square_link', label: 'Square link', provider: 'square' },
  { value: 'square_invoice', label: 'Square invoice', provider: 'square' },
  { value: 'stripe_link', label: 'Stripe link', provider: 'stripe' },
];
const IN_PERSON: PaymentMethodOption = { value: 'in_person', label: 'In person' };

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Link ready — not paid yet',
  sent: 'Sent — not paid yet',
  paid: 'Paid',
  failed: 'Payment failed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export interface PaymentView {
  id: number;
  method: PaymentMethod | 'square_terminal';
  status: string;
  amountCents: number;
  currency: string;
  url: string | null;
  tender: TenderType | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardEntryMethod: string | null;
  reference: string | null;
  receiptUrl: string | null;
}

/** "Visa ···· 4242 · Tap" for a recorded payment row. */
export function paymentTenderSummary(payment: PaymentView): string {
  return tenderSummary({ ...payment, entryMethod: payment.cardEntryMethod });
}

/** Change due on cash handed over (negative = short); `null` until a sum is typed. */
export function cashChangeCents(cashTendered: string, totalCents: number): number | null {
  const tendered = priceCents(cashTendered);
  return tendered == null ? null : tendered - totalCents;
}

export function useOrderPayment({
  orderNumber,
  onEnsureSaved,
  shippingMode,
}: {
  /** The saved order's number; `null` before save. */
  orderNumber: string | null;
  /** Save the order as a draft and return its number — lets "Take payment" work before a save. */
  onEnsureSaved?: () => Promise<string | null>;
  /** `pickup` offers in-person tender first — the customer is at the counter. */
  shippingMode?: IntakeShippingMode;
}) {
  const pickup = shippingMode === 'pickup';
  const [providers, setProviders] = useState<{ square: boolean; stripe: boolean } | null>(null);
  const [method, setMethod] = useState<PaymentMethod>(pickup ? 'in_person' : 'square_link');
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [busy, setBusy] = useState(false);

  // In-person tender facts — never a card number.
  const [tender, setTender] = useState<TenderType>('card');
  const [cardBrand, setCardBrand] = useState<CardBrand | null>(null);
  const [cardLast4, setCardLast4Raw] = useState('');
  const [entryMethod, setEntryMethod] = useState<CardEntryMethod | null>(null);
  const [reference, setReference] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  /** Digits only, at most four — a longer run is refused at the keyboard. */
  const setCardLast4 = useCallback((value: string) => setCardLast4Raw(value.replace(/\D/g, '').slice(0, 4)), []);

  useEffect(() => {
    let live = true;
    void fetch('/api/orders/payments/methods', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data: { methods?: { square: boolean; stripe: boolean } }) => {
        if (live) setProviders(data.methods ?? { square: false, stripe: false });
      })
      .catch(() => {
        if (live) setProviders({ square: false, stripe: false });
      });
    return () => {
      live = false;
    };
  }, []);

  const offered = useMemo<PaymentMethodOption[]>(() => {
    const remote = PROVIDER_METHODS.filter((m) => providers?.[m.provider]).map(({ value, label }) => ({ value, label }));
    return pickup ? [IN_PERSON, ...remote] : [...remote, IN_PERSON];
  }, [providers, pickup]);
  // Switching the order to pickup puts the counter first.
  useEffect(() => {
    if (pickup) setMethod('in_person');
  }, [pickup]);
  useEffect(() => {
    if (!offered.some((m) => m.value === method)) setMethod(offered[0]!.value);
  }, [offered, method]);

  const load = useCallback(async () => {
    if (!orderNumber) return;
    const res = await fetch(`/api/orders/payments?orderNumber=${encodeURIComponent(orderNumber)}`, { credentials: 'same-origin' });
    const data = (await res.json().catch(() => null)) as { payment?: PaymentView | null } | null;
    setPayment(data?.payment ?? null);
  }, [orderNumber]);
  useEffect(() => {
    void load();
  }, [load]);

  const tenderCheck = parseInPersonTender({ tender, cardBrand, cardLast4, entryMethod, reference });
  const panTyped = looksLikePan(reference) || looksLikePan(cardLast4);

  /**
   * Create the link / invoice, or record the in-person tender. A new link is
   * copied; with `share` it goes to the OS share sheet when the device has one
   * (falling back to the copy when the sheet is unavailable or dismissed).
   */
  const take = async ({ share = false }: { share?: boolean } = {}) => {
    const inPerson = method === 'in_person';
    if (inPerson && !tenderCheck.ok) {
      toast.error(tenderCheck.error);
      return;
    }
    setBusy(true);
    try {
      // `onEnsureSaved` saves an unsaved order — and on a saved one lands any
      // cart edit on its held rows — so the amount charged is the cart's.
      const number = (onEnsureSaved ? await onEnsureSaved() : orderNumber) ?? null;
      if (!number) return;
      const body =
        inPerson && tenderCheck.ok
          ? { orderNumber: number, method, ...tenderCheck.tender, idempotencyKey: safeRandomUUID() }
          : { orderNumber: number, method, idempotencyKey: safeRandomUUID() };
      const res = await fetch('/api/orders/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; payment?: PaymentView } | null;
      if (!data?.ok || !data.payment) {
        toast.error(data?.error || (inPerson ? 'Could not record that payment.' : 'Could not create that payment request.'));
        return;
      }
      setPayment(data.payment);
      if (inPerson) {
        toast.success(`Payment recorded — ${paymentTenderSummary(data.payment)}.`);
      } else if (data.payment.url) {
        if (share && (await shareLink(data.payment.url, number))) {
          toast.success('Payment link ready — shared.');
          return;
        }
        await navigator.clipboard.writeText(data.payment.url).catch(() => undefined);
        toast.success('Payment link ready — copied. Read or text it to the caller.');
      } else {
        toast.success('Invoice sent.');
      }
    } finally {
      setBusy(false);
    }
  };

  const cancelOpen = async (id: number) => {
    setBusy(true);
    try {
      const res = await fetch('/api/orders/payments/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; payment?: PaymentView } | null;
      if (!data?.ok) {
        toast.error(data?.error || 'Could not cancel that request.');
        return;
      }
      setPayment(data.payment ?? null);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = (url: string) => void navigator.clipboard.writeText(url).then(() => toast.success('Link copied'));

  const open = payment != null && (payment.status === 'pending' || payment.status === 'sent');
  // A cancelled / failed request no longer holds the order — pick again.
  const settled = payment != null && (open || payment.status === 'paid' || payment.status === 'refunded');

  return {
    /** Connected providers; `null` while loading. */
    providers,
    /** Methods to offer, in order (in person first for pickup). */
    offered,
    method,
    setMethod,
    /** The order's current payment row, if any. */
    payment,
    busy,
    /** An open (pending / sent) request holds the order. */
    open,
    /** Paid, refunded or open — no new request is offered. */
    settled,
    /** An order number exists or can be made — a request can go out. */
    canRequest: orderNumber != null || onEnsureSaved != null,
    tender,
    setTender,
    cardBrand,
    setCardBrand,
    cardLast4,
    setCardLast4,
    entryMethod,
    setEntryMethod,
    reference,
    setReference,
    cashTendered,
    setCashTendered,
    tenderCheck,
    /** A card-number-shaped run was typed in last-4 or the reference. */
    panTyped,
    take,
    cancelOpen,
    copyLink,
  };
}

/**
 * The card FACTS Square recorded for an imported invoice. The invoice list
 * carries the tender's facts; the receipt + authorization code are one
 * Payments API read, fetched only for the invoice actually imported and only
 * once something was paid.
 */
export function useSquareInvoicePaymentFacts(invoice: SquareInvoiceImport): SquarePaymentFacts | null {
  const [facts, setFacts] = useState<SquarePaymentFacts | null>(invoice.payment);
  useEffect(() => {
    setFacts(invoice.payment);
    if (invoice.paidCents <= 0) return;
    let live = true;
    void fetch(`/api/orders/intake/square-invoices/payment?invoiceId=${encodeURIComponent(invoice.invoiceId)}`, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { payment?: SquarePaymentFacts | null } | null) => {
        if (live && data?.payment) setFacts(data.payment);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [invoice]);
  return facts;
}

async function shareLink(url: string, orderNumber: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    await navigator.share({ title: `Pay order ${orderNumber}`, url });
    return true;
  } catch {
    return false;
  }
}
