'use client';

/** Payment — the open order's money detail, one disclosure under the items: the paid amount collapsed; items, tax, shipping, label costs and net open. Line prices read on the items themselves. */

import { useState } from 'react';
import { ChevronRight } from '@/components/Icons';
import { EvidenceDisclosure, EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_PRICE_CLASS,
  RECORD_TRAILING_CELL_CLASS,
} from '@/design-system/tokens/industrial-record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { LABEL_PURPOSES, LABEL_PURPOSE_FACE } from '@/lib/shipping/label-purpose';
import { formatCurrency } from '@/utils/_number';
import { cn } from '@/utils/_cn';
import { useOrderPriceBreakdown } from './order-labels-client';

const dash = (value: number | null | undefined) => (value == null ? '—' : formatCurrency(value));

/** A cost the net subtracts, painted as a debit. */
const debit = (value: number) => (value === 0 ? formatCurrency(0) : `−${formatCurrency(value)}`);

const NET_BASIS_LABEL = {
  amount_paid: 'paid',
  order_total: 'order total',
  sale_amount: 'sale amount',
} as const;

export function OrderPriceEvidence({
  orderId,
  variant = 'disclosure',
  immediateTotal = null,
}: {
  orderId: number;
  /** Allocate keeps the exact order math inside the Items group. */
  variant?: 'disclosure' | 'item-footer';
  /** Already-loaded row total, painted on first render while exact math hydrates. */
  immediateTotal?: number | null;
}) {
  const query = useOrderPriceBreakdown(orderId);
  const [linesOpen, setLinesOpen] = useState(false);
  const b = query.data ?? null;
  const unreadable = query.isError && immediateTotal == null;
  const net = b?.net ?? null;
  // Some marketplace imports persist `amountPaid: 0` when payment happens on
  // the marketplace. A positive order total is the useful price in that case;
  // do not mislabel the imported zero as the value of the order.
  const reportedPaid =
    b?.amountPaid != null &&
    (b.amountPaid > 0 || ((b.orderTotal ?? 0) === 0 && (immediateTotal ?? 0) === 0))
      ? b.amountPaid
      : null;
  // The row reads the price the buyer paid (owner 2026-09-26: no "Net" on the
  // row); the net math stays inside the disclosure.
  const positiveOrderTotal = b?.orderTotal != null && b.orderTotal > 0 ? b.orderTotal : null;
  const price = reportedPaid ?? positiveOrderTotal ?? immediateTotal ?? b?.saleAmount ?? b?.itemSubtotal ?? null;

  if (variant === 'item-footer') {
    const rows = b
      ? [
          { label: 'Items', value: immediateTotal ?? b.itemSubtotal ?? b.saleAmount },
          ...(b.adjustments != null ? [{ label: 'Adjustments', value: b.adjustments }] : []),
          ...(b.shippingCharged != null ? [{ label: 'Shipping', value: b.shippingCharged }] : []),
          ...(b.tax != null ? [{ label: 'Tax', value: b.tax }] : []),
          ...(b.labelCostTotal > 0 ? [{ label: 'Labels', value: -b.labelCostTotal }] : []),
          {
            label: reportedPaid != null ? 'Paid' : 'Total',
            value: price,
          },
        ]
      : immediateTotal != null
        ? [{ label: 'Total', value: immediateTotal }]
        : [];
    return (
      <div className="flex min-w-0 justify-end border-t border-mode-edge px-4 py-3" data-testid="order-record-price">
        <div className="w-full max-w-72">
          {unreadable ? (
            <p className={cn(RECORD_ID_CLASS, 'text-right text-mode-warn')}>Unreadable</p>
          ) : rows.length === 0 ? (
            <p className={cn(RECORD_ID_CLASS, 'text-right text-mode-muted')}>—</p>
          ) : (
            <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-1">
              {rows.map((row, index) => (
                <div key={`${row.label}-${index}`} className="contents">
                  <dt className={cn(RECORD_LABEL_CLASS, 'text-right text-mode-muted')}>{row.label}</dt>
                  <dd
                    className={cn(
                      RECORD_ID_CLASS,
                      'min-w-20 text-right',
                      row.value != null && row.value < 0
                        ? STATE_TONE_CLASSES.danger.text
                        : row.value == null
                          ? 'text-mode-muted'
                          : RECORD_PRICE_CLASS,
                      index === rows.length - 1 && 'font-black',
                    )}
                  >
                    {row.value == null ? '—' : row.value < 0 ? debit(Math.abs(row.value)) : formatCurrency(row.value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    );
  }

  return (
    <EvidenceDisclosure
      label="Payment"
      testId="evidence-price"
      summary={
        <span className="inline-flex min-w-0 items-baseline gap-1.5">
          <span
            data-testid="evidence-price-value"
            className={cn(
              RECORD_ID_CLASS,
              unreadable ? 'text-mode-warn' : price == null ? 'text-mode-muted' : STATE_TONE_CLASSES.success.text,
            )}
          >
            {unreadable ? 'Unreadable' : dash(price)}
          </span>
          {reportedPaid != null ? <span className="text-role-caption text-mode-muted">paid</span> : null}
        </span>
      }
    >
      {b ? (
        <div className="flex flex-col px-4">
          {b.lines.length > 0 ? (
            <EvidenceFactRow label="Items">
              <button
                type="button"
                aria-expanded={linesOpen}
                data-testid="evidence-price-items"
                onClick={() => setLinesOpen((open) => !open)}
                className={cn('ds-raw-button flex w-full min-w-0 items-center gap-2 text-left', focusRing('control'))}
              >
                <span className={RECORD_ID_CLASS}>{dash(b.itemSubtotal)}</span>
                <span className="min-w-0 flex-1 truncate text-mode-muted">
                  {b.lines.length} line{b.lines.length === 1 ? '' : 's'}
                </span>
                <span aria-hidden className={RECORD_TRAILING_CELL_CLASS}>
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', linesOpen && 'rotate-90')} />
                </span>
              </button>
            </EvidenceFactRow>
          ) : null}
          {linesOpen ? (
            <div className="border-b border-mode-edge py-1" data-testid="evidence-price-lines">
              {b.lines.map((line, i) => (
                <span key={`${line.sku ?? ''}-${i}`} className="flex min-w-0 items-baseline gap-2 py-0.5 pl-24">
                  <span className="min-w-0 flex-1 truncate" title={line.name ?? undefined}>
                    {line.sku ?? line.name ?? '—'}
                  </span>
                  <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>
                    {line.quantity} × {dash(line.unitPrice)}
                  </span>
                  <span className={cn(RECORD_ID_CLASS, 'w-20 text-right')}>{dash(line.total)}</span>
                </span>
              ))}
            </div>
          ) : null}
          {b.adjustments != null ? (
            <EvidenceFactRow label="Adjust.">
              <span className={RECORD_ID_CLASS}>{formatCurrency(b.adjustments)}</span>
            </EvidenceFactRow>
          ) : null}
          {b.saleAmount != null ? (
            <EvidenceFactRow label="Sale">
              <span className={RECORD_ID_CLASS}>{formatCurrency(b.saleAmount)}</span>
            </EvidenceFactRow>
          ) : null}
          {b.source === 'shipstation' ? (
            <>
              <EvidenceFactRow label="Shipping">
                <span className={RECORD_ID_CLASS}>{dash(b.shippingCharged)}</span>
              </EvidenceFactRow>
              <EvidenceFactRow label="Tax">
                <span className={RECORD_ID_CLASS}>{dash(b.tax)}</span>
              </EvidenceFactRow>
              <EvidenceFactRow label="Total">
                <span className={RECORD_ID_CLASS}>{dash(b.orderTotal)}</span>
              </EvidenceFactRow>
              <EvidenceFactRow label="Paid">
                <span className={RECORD_PRICE_CLASS}>{dash(b.amountPaid)}</span>
              </EvidenceFactRow>
            </>
          ) : null}
          {LABEL_PURPOSES.filter((p) => b.labelCostByPurpose[p] != null).map((p) => (
            <EvidenceFactRow key={p} label={`${LABEL_PURPOSE_FACE[p].code} label${b.labels.filter((l) => l.purpose === p).length > 1 ? 's' : ''}`}>
              <span className={cn(RECORD_ID_CLASS, STATE_TONE_CLASSES.danger.text)} data-testid={`evidence-price-label-${p}`}>
                {debit(b.labelCostByPurpose[p]!)}
              </span>
            </EvidenceFactRow>
          ))}
          <EvidenceFactRow label="Net">
            <span className="flex min-w-0 flex-col py-1">
              <span className={cn(RECORD_ID_CLASS, 'font-black', net != null && net < 0 ? STATE_TONE_CLASSES.danger.text : 'text-mode-ink')}>
                {dash(net)}
              </span>
              <span className={cn(RECORD_LABEL_CLASS, 'normal-case tracking-normal text-mode-muted')}>
                {b.netBasis ? NET_BASIS_LABEL[b.netBasis] : 'paid'} − tax − label costs · no marketplace fees
              </span>
            </span>
          </EvidenceFactRow>
          {b.gaps.length > 0 ? (
            <p className={cn(RECORD_LABEL_CLASS, 'normal-case tracking-normal py-2 text-mode-warn')} data-testid="evidence-price-gaps">
              * {b.gaps.join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </EvidenceDisclosure>
  );
}
