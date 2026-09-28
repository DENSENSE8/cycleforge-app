'use client';

/**
 * Payment: what the order costs (from its lines) and how the customer pays —
 * a Square payment link / invoice or a Stripe checkout link
 * (`/api/orders/payments`), or **In person** at the counter.
 *
 * Card numbers never touch CycleForge. "Take payment" hands the caller a
 * provider-hosted page to pay on; "In person" records a payment already taken
 * on the counter reader (or in cash / by check / Zelle) as its FACTS only —
 * card brand, last 4 digits, how the card met the reader, the reader's
 * authorization code (`src/lib/order-payments/tender.ts`). Only the providers
 * this org has connected are offered (`/api/orders/payments/methods`); in
 * person is always offered, and first for a pickup. An unsaved order is saved
 * as a draft first (`onEnsureSaved`) — one press.
 */

import { useRef, type KeyboardEvent } from 'react';
import { Copy } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { formatCents, type ManualOrderTotals } from '@/lib/orders/manual-order-draft';
import {
  CARD_BRAND_LABEL,
  CARD_ENTRY_LABEL,
  COUNTER_CARD_BRANDS,
  COUNTER_ENTRY_METHODS,
  PAN_REFUSAL,
  TENDER_LABEL,
  TENDER_TYPES,
} from '@/lib/order-payments/tender';
import { cn } from '@/utils/_cn';
import type { IntakeShippingMode } from '@/lib/orders/intake/intake-model';
import { PAYMENT_STATUS_LABEL, cashChangeCents, paymentTenderSummary, useOrderPayment } from '@/hooks/orders/useOrderPayment';

/** Segmented radio: one tab stop, arrows move and select (the form's radio keyboard contract). */
function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
  testId: string;
}) {
  const radios = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0 || options.length === 0) return;
    event.preventDefault();
    const at = options.findIndex((o) => o.value === value);
    const next = (at + step + options.length) % options.length;
    onChange(options[next]!.value);
    radios.current[next]?.focus();
  };
  // With nothing picked yet, the first option carries the tab stop.
  const focusable = options.some((o) => o.value === value) ? value : options[0]?.value;
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex flex-wrap items-center gap-0.5 rounded-mode-control bg-surface-sunken p-0.5"
    >
      {options.map((o, index) => (
        <button
          key={o.value}
          ref={(node) => {
            radios.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={focusable === o.value ? 0 : -1}
          onClick={() => onChange(o.value)}
          data-testid={`${testId}-${o.value}`}
          className={cn(
            'inline-flex h-8 items-center rounded-mode-control px-3 text-role-caption font-medium transition-colors',
            value === o.value ? 'bg-surface-card text-text-default shadow-elev-soft' : 'text-text-muted hover:text-text-default',
            focusRing('control'),
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IntakePaymentFields({
  totals,
  currency,
  orderNumber,
  onEnsureSaved,
  shippingMode,
}: {
  totals: ManualOrderTotals;
  currency: string;
  /** The saved order's number; `null` before save. */
  orderNumber: string | null;
  /** Save the order as a draft and return its number — lets "Take payment" work before a save. */
  onEnsureSaved?: () => Promise<string | null>;
  /** `pickup` offers in-person tender first — the customer is at the counter. */
  shippingMode?: IntakeShippingMode;
}) {
  const {
    providers,
    offered,
    method,
    setMethod,
    payment,
    busy,
    open,
    settled,
    canRequest,
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
    panTyped,
    take,
    cancelOpen,
    copyLink,
  } = useOrderPayment({ orderNumber, onEnsureSaved, shippingMode });

  const rows: Array<[string, number]> = [
    ['Subtotal', totals.subtotalCents],
    ['Shipping', totals.shippingCents],
    ['Tax', totals.taxCents],
  ];
  const canTake = totals.priced && totals.subtotalCents > 0 && canRequest;
  const changeCents = cashChangeCents(cashTendered, totals.totalCents);

  return (
    <div className="space-y-3" data-testid="intake-payment">
      <dl className="space-y-1 text-role-caption">
        {rows.map(([label, cents]) => (
          <div key={label} className="flex justify-between text-text-muted">
            <dt>{label}</dt>
            <dd className="tabular-nums">{formatCents(cents, currency)}</dd>
          </div>
        ))}
        <div className="flex justify-between pt-1 text-role-body font-semibold text-text-default">
          <dt>Total</dt>
          <dd className="tabular-nums" data-testid="intake-payment-total">{formatCents(totals.totalCents, currency)}</dd>
        </div>
      </dl>
      {!totals.priced && totals.subtotalCents > 0 ? (
        <p className="text-role-caption text-text-warning">A line has no price yet — the total leaves it out.</p>
      ) : null}

      {payment ? (
        <div className="flex items-center gap-2 rounded-mode-control bg-surface-sunken px-3 py-2" data-testid="intake-payment-status">
          <span className={cn('min-w-0 flex-1 text-role-caption', payment.status === 'paid' ? 'text-text-success' : 'text-text-default')}>
            {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status} · {formatCents(payment.amountCents, payment.currency)}
            {payment.tender ? <span data-testid="intake-payment-tender"> · {paymentTenderSummary(payment)}</span> : null}
            {payment.reference ? <span className="text-text-muted"> · Ref {payment.reference}</span> : null}
          </span>
          {payment.receiptUrl ? (
            <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="text-role-caption text-text-accent underline-offset-2 hover:underline">
              Receipt
            </a>
          ) : null}
          {payment.url && open ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<Copy className="size-3.5" />}
              onClick={() => copyLink(payment.url!)}
            >
              Copy link
            </Button>
          ) : null}
          {open ? (
            <Button variant="ghost" size="sm" loading={busy} onClick={() => void cancelOpen(payment.id)} data-testid="intake-payment-cancel">
              Cancel request
            </Button>
          ) : null}
        </div>
      ) : null}

      {settled ? null : (
        <div className="space-y-3">
          {providers && offered.length === 1 ? (
            <p className="text-role-caption text-text-muted" data-testid="intake-payment-none">
              No payment provider is connected — connect Square or Stripe in Integrations to send a link. In-person payments can still be recorded.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Choice label="Payment method" options={offered} value={method} onChange={setMethod} testId="intake-payment" />
            {method === 'in_person' ? null : (
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                disabled={!canTake}
                onClick={() => void take()}
                data-testid="intake-take-payment"
              >
                Take payment
              </Button>
            )}
          </div>

          {method === 'in_person' ? (
            <div className="space-y-3 rounded-mode-control border border-border-hairline p-3" data-testid="intake-in-person">
              <Choice
                label="Tender"
                options={TENDER_TYPES.map((t) => ({ value: t, label: TENDER_LABEL[t] }))}
                value={tender}
                onChange={setTender}
                testId="intake-tender"
              />
              {tender === 'card' ? (
                <>
                  <Choice
                    label="Card brand"
                    options={COUNTER_CARD_BRANDS.map((b) => ({ value: b, label: CARD_BRAND_LABEL[b] }))}
                    value={cardBrand}
                    onChange={setCardBrand}
                    testId="intake-card-brand"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <TextField
                      label="Last 4 digits"
                      value={cardLast4}
                      onChange={setCardLast4}
                      inputMode="numeric"
                      maxLength={4}
                      autoComplete="off"
                      mono
                      className="w-36"
                      data-testid="intake-card-last4"
                    />
                    <Choice
                      label="Card entry"
                      options={COUNTER_ENTRY_METHODS.map((m) => ({ value: m, label: CARD_ENTRY_LABEL[m] }))}
                      value={entryMethod}
                      onChange={setEntryMethod}
                      testId="intake-card-entry"
                    />
                  </div>
                </>
              ) : null}
              {tender === 'cash' ? (
                <div className="flex flex-wrap items-center gap-3">
                  <TextField
                    label="Cash handed over"
                    value={cashTendered}
                    onChange={setCashTendered}
                    inputMode="decimal"
                    autoComplete="off"
                    className="w-44"
                    data-testid="intake-cash-tendered"
                  />
                  {changeCents != null ? (
                    <span
                      className={cn('text-role-body tabular-nums', changeCents < 0 ? 'text-text-warning' : 'text-text-default')}
                      data-testid="intake-cash-change"
                    >
                      {changeCents < 0 ? `Short ${formatCents(-changeCents, currency)}` : `Change due ${formatCents(changeCents, currency)}`}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <TextField
                label={tender === 'card' ? 'Authorization code (optional)' : tender === 'other' ? 'Check no. or Zelle confirmation' : 'Note (optional)'}
                value={reference}
                onChange={setReference}
                autoComplete="off"
                maxLength={80}
                data-testid="intake-payment-reference"
              />
              {panTyped ? (
                <p className="text-role-caption text-text-danger" role="alert" data-testid="intake-pan-warning">{PAN_REFUSAL}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  disabled={!canTake || !tenderCheck.ok}
                  onClick={() => void take()}
                  data-testid="intake-record-payment"
                >
                  Record payment · {formatCents(totals.totalCents, currency)}
                </Button>
                <p className="min-w-0 flex-1 text-role-caption text-text-muted">
                  Take the card on the counter reader first. Never type the card number, expiry or CVV here — only the brand and the last 4 digits.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-role-caption text-text-muted">
              {orderNumber
                ? 'The provider hosts the card entry — never type a card number here.'
                : 'Saves the order as a draft, then makes the link. Never type a card number here.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
