'use client';

/**
 * Phone face of the new sales order's Payment step (desk twin:
 * `IntakePaymentFields`; logic shared through `useOrderPayment`). An imported
 * Square invoice is paid on the invoice itself ({@link MobileInvoicePayment}).
 * Otherwise: what the order costs, then how the customer pays — a provider
 * link / invoice ("Take payment" saves a draft first, then shares the link),
 * or **In person**: the FACTS of a payment already taken on the counter
 * reader (or cash / check / Zelle). Card numbers never touch CycleForge.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Copy, ExternalLink, Share2, X } from '@/components/Icons';
import { DetailFact, DetailFacts } from '@/components/mobile/detail/DetailParts';
import { MobileFormHeading } from './MobileFormHeading';
import { MobileInvoicePayment } from '@/components/mobile/orders/new/MobileInvoicePayment';
import { MobileChoiceGrid, MobileChoiceRows } from '@/components/mobile/orders/new/MobileChoice';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import {
  PAYMENT_STATUS_LABEL,
  cashChangeCents,
  paymentTenderSummary,
  useOrderPayment,
  type PaymentMethod,
} from '@/hooks/orders/useOrderPayment';
import type { IntakeShippingMode } from '@/lib/orders/intake/intake-model';
import { formatCents, type ManualOrderTotals } from '@/lib/orders/manual-order-draft';
import type { SquareInvoiceImport } from '@/lib/orders/square-invoice-import-core';
import {
  CARD_BRAND_LABEL,
  CARD_ENTRY_LABEL,
  COUNTER_CARD_BRANDS,
  COUNTER_ENTRY_METHODS,
  PAN_REFUSAL,
  TENDER_TYPES,
  type TenderType,
} from '@/lib/order-payments/tender';
import { cn } from '@/utils/_cn';

export interface MobilePaymentStepProps {
  totals: ManualOrderTotals;
  currency: string;
  /** The saved order's number; `null` before save. */
  orderNumber: string | null;
  /** Save the order as a draft and return its number — lets "Take payment" work before a save. */
  onEnsureSaved?: () => Promise<string | null>;
  /** `pickup` offers in-person tender first — the customer is at the counter. */
  shippingMode?: IntakeShippingMode;
  /** An imported Square invoice collects the payment itself; `null` otherwise. */
  invoice: SquareInvoiceImport | null;
}

export function MobilePaymentStep({ invoice, ...rest }: MobilePaymentStepProps) {
  return (
    <div data-testid="m-order-payment">
      {invoice ? <MobileInvoicePayment invoice={invoice} /> : <RequestPayment {...rest} />}
    </div>
  );
}

const METHOD_HINT: Record<PaymentMethod, string> = {
  in_person: 'Card on the counter reader, cash, check or Zelle',
  square_link: 'A Square page the customer pays on',
  square_invoice: 'Square emails the customer an invoice',
  stripe_link: 'A Stripe checkout page the customer pays on',
};

/** Short cell labels; the reference field's label names check / Zelle for Other. */
const TENDER_CELL: Record<TenderType, string> = { card: 'Card', cash: 'Cash', other: 'Other' };

type StatusVerb = 'receipt' | 'copy' | 'share' | 'cancel';

function RequestPayment({ totals, currency, orderNumber, onEnsureSaved, shippingMode }: Omit<MobilePaymentStepProps, 'invoice'>) {
  const pay = useOrderPayment({ orderNumber, onEnsureSaved, shippingMode });
  const { payment, method, tender } = pay;
  // `navigator.share` is read after mount so the server render and the first client render agree.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);

  const money = (cents: number) => formatCents(cents, currency);
  const hasTotal = totals.priced && totals.subtotalCents > 0;
  const canTake = hasTotal && pay.canRequest;
  const changeCents = cashChangeCents(pay.cashTendered, totals.totalCents);
  const inPerson = method === 'in_person';
  const missing = !hasTotal
    ? totals.subtotalCents > 0
      ? 'Price every line first.'
      : 'Add a priced line first.'
    : !pay.canRequest
      ? 'Save the order first.'
      : inPerson && !pay.tenderCheck.ok
        ? pay.tenderCheck.error
        : null;

  const statusVerbs: DetailDockVerb<StatusVerb>[] = [];
  if (payment?.receiptUrl) statusVerbs.push({ id: 'receipt', label: 'Receipt', icon: <ExternalLink /> });
  if (payment?.url && pay.open) {
    statusVerbs.push({ id: 'copy', label: 'Copy link', icon: <Copy /> });
    if (canShare) statusVerbs.push({ id: 'share', label: 'Share link', icon: <Share2 /> });
  }
  if (pay.open) statusVerbs.push({ id: 'cancel', label: 'Cancel request', icon: <X />, loading: pay.busy });

  const onStatusVerb = async (id: StatusVerb) => {
    if (!payment) return;
    if (id === 'receipt' && payment.receiptUrl) window.open(payment.receiptUrl, '_blank', 'noreferrer');
    else if (id === 'copy' && payment.url) pay.copyLink(payment.url);
    else if (id === 'share' && payment.url) await navigator.share({ title: `Pay order ${orderNumber ?? ''}`.trim(), url: payment.url }).catch(() => undefined);
    else if (id === 'cancel') await pay.cancelOpen(payment.id);
  };

  return (
    <div className="flex flex-col divide-y divide-mode-rule">
      <DetailFacts label="Order total">
        <DetailFact label="Subtotal" value={money(totals.subtotalCents)} />
        <DetailFact label="Shipping" value={money(totals.shippingCents)} />
        <DetailFact label="Tax" value={money(totals.taxCents)} />
        <DetailFact
          label="Total"
          value={<span className="tabular-nums" data-testid="m-order-payment-total">{money(totals.totalCents)}</span>}
          hint={!totals.priced && totals.subtotalCents > 0 ? <span className="text-text-warning">A line has no price yet — the total leaves it out.</span> : undefined}
        />
      </DetailFacts>

      {payment ? (
        <section data-testid="m-order-payment-status">
          <p className="px-mode-page py-3">
            <span className={cn('block text-mode-body font-semibold', payment.status === 'paid' ? 'text-text-success' : 'text-mode-ink')}>
              {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status} · {formatCents(payment.amountCents, payment.currency)}
            </span>
            {payment.tender || payment.reference ? (
              <span className="block text-role-caption text-mode-muted">
                {payment.tender ? <span data-testid="m-order-payment-tender">{paymentTenderSummary(payment)}</span> : null}
                {payment.tender && payment.reference ? ' · ' : null}
                {payment.reference ? `Ref ${payment.reference}` : null}
              </span>
            ) : null}
          </p>
          {statusVerbs.length > 0 ? (
            <DetailDock label="Payment actions" placement="inline" verbs={statusVerbs} onVerb={onStatusVerb} />
          ) : null}
        </section>
      ) : null}

      {pay.settled ? null : (
        <>
          <section aria-labelledby="m-order-payment-method">
            <MobileFormHeading id="m-order-payment-method">How they pay</MobileFormHeading>
            {pay.providers && pay.offered.length === 1 ? (
              <p className="px-mode-page py-3 text-role-caption text-mode-muted" data-testid="m-order-payment-none">
                No payment provider is connected — connect Square or Stripe in Integrations to send a link. In-person payments can still be recorded.
              </p>
            ) : null}
            <MobileChoiceRows
              label="Payment method"
              options={pay.offered.map((o) => ({ ...o, hint: METHOD_HINT[o.value] }))}
              value={method}
              onChange={pay.setMethod}
              testId="m-order-payment-method"
            />
          </section>

          {inPerson ? (
            <section aria-labelledby="m-order-in-person" data-testid="m-order-in-person">
              <MobileFormHeading id="m-order-in-person">Payment taken</MobileFormHeading>
              <MobileChoiceGrid
                label="Tender"
                options={TENDER_TYPES.map((t) => ({ value: t, label: TENDER_CELL[t] }))}
                value={tender}
                onChange={pay.setTender}
                testId="m-order-tender"
              />
              {tender === 'card' ? (
                <>
                  <SubHeading>Card brand</SubHeading>
                  <MobileChoiceGrid
                    label="Card brand"
                    options={COUNTER_CARD_BRANDS.map((b) => ({ value: b, label: CARD_BRAND_LABEL[b] }))}
                    value={pay.cardBrand}
                    onChange={pay.setCardBrand}
                    testId="m-order-card-brand"
                  />
                  <SubHeading>How the card met the reader</SubHeading>
                  <MobileChoiceGrid
                    label="Card entry"
                    columns={4}
                    options={COUNTER_ENTRY_METHODS.map((m) => ({ value: m, label: CARD_ENTRY_LABEL[m] }))}
                    value={pay.entryMethod}
                    onChange={pay.setEntryMethod}
                    testId="m-order-card-entry"
                  />
                </>
              ) : null}
              <div className="space-y-3 px-mode-page py-3">
                {tender === 'card' ? (
                  <TextField
                    label="Last 4 digits"
                    value={pay.cardLast4}
                    onChange={pay.setCardLast4}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    autoComplete="off"
                    mono
                    data-testid="m-order-card-last4"
                  />
                ) : null}
                {tender === 'cash' ? (
                  <>
                    <TextField
                      label="Cash handed over"
                      value={pay.cashTendered}
                      onChange={pay.setCashTendered}
                      inputMode="decimal"
                      autoComplete="off"
                      data-testid="m-order-cash-tendered"
                    />
                    {changeCents != null ? (
                      <p
                        className={cn('text-mode-body font-semibold tabular-nums', changeCents < 0 ? 'text-text-warning' : 'text-mode-ink')}
                        data-testid="m-order-cash-change"
                      >
                        {changeCents < 0 ? `Short ${money(-changeCents)}` : `Change due ${money(changeCents)}`}
                      </p>
                    ) : null}
                  </>
                ) : null}
                <TextField
                  label={tender === 'card' ? 'Authorization code (optional)' : tender === 'other' ? 'Check no. or Zelle confirmation' : 'Note (optional)'}
                  value={pay.reference}
                  onChange={pay.setReference}
                  autoComplete="off"
                  maxLength={80}
                  data-testid="m-order-payment-reference"
                />
                {pay.panTyped ? (
                  <p className="text-role-caption font-semibold text-text-danger" role="alert" data-testid="m-order-pan-warning">
                    {PAN_REFUSAL}
                  </p>
                ) : null}
                <p className="text-role-caption text-mode-muted">
                  Take the card on the counter reader first. Never type the card number, expiry or CVV here — only the brand and the last 4 digits.
                </p>
                <Action
                  label={`Record payment · ${money(totals.totalCents)}`}
                  busy={pay.busy}
                  disabled={!canTake || !pay.tenderCheck.ok}
                  missing={missing}
                  onPress={() => void pay.take()}
                  testId="m-order-record-payment"
                />
              </div>
            </section>
          ) : (
            <div className="space-y-3 px-mode-page py-3">
              <p className="text-role-caption text-mode-muted">
                {orderNumber
                  ? 'The provider hosts the card entry — never type a card number here.'
                  : 'Saves the order as a draft, then makes the link to share. Never type a card number here.'}
              </p>
              <Action
                label="Take payment"
                busy={pay.busy}
                disabled={!canTake}
                missing={missing}
                onPress={() => void pay.take({ share: true })}
                testId="m-order-take-payment"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <p className="px-mode-page pb-1.5 pt-3 text-role-caption font-medium text-mode-muted">{children}</p>;
}

/** The step's own verb (the shell's dock carries Back / Continue); a disabled press names what's missing. */
function Action({
  label,
  busy,
  disabled,
  missing,
  onPress,
  testId,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  missing: string | null;
  onPress: () => void;
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <Button variant="secondary" size="lg" className="w-full" loading={busy} disabled={disabled} onClick={onPress} data-testid={testId}>
        {label}
      </Button>
      {disabled && missing ? (
        <p className="text-role-caption text-mode-muted" data-testid={`${testId}-missing`}>
          {missing}
        </p>
      ) : null}
    </div>
  );
}
