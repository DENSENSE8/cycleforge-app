'use client';

/**
 * Payment step for an imported Square invoice: the customer pays (or paid) the
 * invoice itself, so nothing is requested here — a second request would
 * double-charge. When Square says it is paid, the card FACTS Square recorded
 * are shown (brand, last 4, how the card met the reader) with Square's own
 * receipt — read back from Square, never typed, never a card number.
 */

import { useSquareInvoicePaymentFacts } from '@/hooks/orders/useOrderPayment';
import { formatCents } from '@/lib/orders/manual-order-draft';
import type { SquareInvoiceImport } from '@/lib/orders/square-invoice-import-core';
import { tenderSummary } from '@/lib/order-payments/tender';
import { cn } from '@/utils/_cn';

export function CheckoutInvoicePayment({ invoice }: { invoice: SquareInvoiceImport }) {
  const paid = invoice.paidCents > 0 && invoice.paidCents >= invoice.totalCents;
  const facts = useSquareInvoicePaymentFacts(invoice);

  return (
    <div className="space-y-1 rounded-mode-control bg-surface-sunken px-3 py-2" data-testid="checkout-invoice-payment">
      <p className={cn('text-role-caption', paid ? 'text-text-success' : 'text-text-muted')}>
        {paid
          ? `Paid on Square — ${formatCents(invoice.paidCents, invoice.currency)} on invoice #${invoice.invoiceNumber}`
          : `Collected by Square invoice #${invoice.invoiceNumber} (${invoice.status.replace(/_/g, ' ').toLowerCase()}${
              invoice.paidCents > 0 ? `, ${formatCents(invoice.paidCents, invoice.currency)} of ${formatCents(invoice.totalCents, invoice.currency)} paid` : ''
            }) — the customer pays the invoice; nothing is charged here.`}
      </p>
      {facts ? (
        <p className="flex flex-wrap items-center gap-x-2 text-role-caption text-text-default" data-testid="checkout-invoice-card">
          <span>{tenderSummary(facts)}</span>
          {facts.authCode ? <span className="text-text-muted">Auth {facts.authCode}</span> : null}
          {facts.receiptUrl ? (
            <a
              href={facts.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="text-text-accent underline-offset-2 hover:underline"
              data-testid="checkout-invoice-receipt"
            >
              Square receipt
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
