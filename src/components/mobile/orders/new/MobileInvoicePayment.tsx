'use client';

/**
 * Phone Payment step for an imported Square invoice (desk twin:
 * `CheckoutInvoicePayment`). The customer pays (or paid) the invoice itself,
 * so nothing is requested here — a second request would double-charge. When
 * Square says it is paid, the card FACTS Square recorded are shown (brand,
 * last 4, how the card met the reader, the authorization code) with Square's
 * own receipt — read back from Square, never typed, never a card number.
 */

import { ExternalLink } from '@/components/Icons';
import { DetailFact, DetailFacts } from '@/components/mobile/detail/DetailParts';
import { useSquareInvoicePaymentFacts } from '@/hooks/orders/useOrderPayment';
import { formatCents } from '@/lib/orders/manual-order-draft';
import type { SquareInvoiceImport } from '@/lib/orders/square-invoice-import-core';
import { CARD_BRAND_LABEL, CARD_ENTRY_LABEL, TENDER_LABEL } from '@/lib/order-payments/tender';
import { cn } from '@/utils/_cn';

export function MobileInvoicePayment({ invoice }: { invoice: SquareInvoiceImport }) {
  const paid = invoice.paidCents > 0 && invoice.paidCents >= invoice.totalCents;
  const facts = useSquareInvoicePaymentFacts(invoice);
  const money = (cents: number) => formatCents(cents, invoice.currency);

  return (
    <div className="flex flex-col divide-y divide-mode-rule" data-testid="m-order-invoice-payment">
      <p
        className={cn('px-mode-page py-3 text-mode-body font-semibold', paid ? 'text-text-success' : 'text-mode-ink')}
        data-testid="m-order-invoice-status"
      >
        {paid ? `Paid on Square — ${money(invoice.paidCents)}` : 'Collected by the Square invoice'}
        {paid ? null : (
          <span className="mt-0.5 block text-role-caption font-normal text-mode-muted">
            The customer pays the invoice; nothing is charged here.
          </span>
        )}
      </p>
      <DetailFacts label="Square invoice">
        <DetailFact label="Invoice" value={`#${invoice.invoiceNumber}`} mono copy={invoice.invoiceNumber} />
        <DetailFact label="Square status" value={invoice.status.replace(/_/g, ' ').toLowerCase()} />
        <DetailFact
          label="Paid"
          value={invoice.paidCents > 0 ? `${money(invoice.paidCents)} of ${money(invoice.totalCents)}` : `Nothing yet of ${money(invoice.totalCents)}`}
        />
      </DetailFacts>
      {facts ? (
        <DetailFacts label="Card facts from Square">
          <DetailFact label="Tender" value={TENDER_LABEL[facts.tender]} />
          {facts.tender === 'card' ? (
            <>
              <DetailFact label="Card" value={facts.cardBrand ? CARD_BRAND_LABEL[facts.cardBrand] : null} />
              <DetailFact label="Last 4" value={facts.cardLast4 ? `···· ${facts.cardLast4}` : null} mono />
              <DetailFact label="Entry" value={facts.entryMethod ? CARD_ENTRY_LABEL[facts.entryMethod] : null} />
            </>
          ) : null}
          <DetailFact label="Auth" value={facts.authCode} mono copy={facts.authCode} />
        </DetailFacts>
      ) : null}
      {facts?.receiptUrl ? (
        <a
          href={facts.receiptUrl}
          target="_blank"
          rel="noreferrer"
          className="group flex min-h-mode-hit-cta items-center justify-between gap-3 px-mode-page py-2.5 text-mode-body font-semibold text-mode-ink active:bg-mode-hover"
          data-testid="m-order-invoice-receipt"
        >
          Square receipt
          <ExternalLink className="h-5 w-5 shrink-0 text-mode-muted" aria-hidden />
        </a>
      ) : null}
    </div>
  );
}
