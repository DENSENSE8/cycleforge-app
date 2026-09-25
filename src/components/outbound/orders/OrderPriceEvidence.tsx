'use client';

/**
 * Price — the open order's money in the Selected-order column: item lines
 * (qty × unit), shipping the buyer paid, tax, order total and amount paid (the
 * persisted ShipStation v1 order), each label's cost split by purpose, and the
 * net: paid − tax − label costs. Marketplace fees are not in this data and the
 * net says so. Reads `GET /api/orders/[id]/price-breakdown` (persisted rows —
 * no ShipStation call per render).
 */

import { useState } from 'react';
import { ChevronRight } from '@/components/Icons';
import { LEDGER_HIT_CLASS } from './outbound-orders-ledger-geometry';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_PRICE_CLASS } from '@/design-system/tokens/industrial-record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { LABEL_PURPOSES, LABEL_PURPOSE_FACE } from '@/lib/shipping/label-purpose';
import { formatCurrency } from '@/utils/_number';
import { cn } from '@/utils/_cn';
import { Fact } from './EvidenceFact';
import { useOrderPriceBreakdown } from './order-labels-client';

const dash = (value: number | null | undefined) => (value == null ? '—' : formatCurrency(value));

/** A cost the net subtracts, painted as a debit. */
const debit = (value: number) => (value === 0 ? formatCurrency(0) : `−${formatCurrency(value)}`);

const NET_BASIS_LABEL = {
  amount_paid: 'paid',
  order_total: 'order total',
  sale_amount: 'sale amount',
} as const;

export function OrderPriceEvidence({ orderId }: { orderId: number }) {
  const query = useOrderPriceBreakdown(orderId);
  const [linesOpen, setLinesOpen] = useState(false);
  const b = query.data ?? null;
  const net = b?.net ?? null;

  return (
    <section aria-label="Price" data-testid="evidence-price" className="border-b border-mode-ink">
      <div className={cn('flex items-center gap-2 border-b border-mode-edge px-4', LEDGER_HIT_CLASS)}>
        <span className={cn(RECORD_LABEL_CLASS, 'flex-1 text-mode-muted')}>Price</span>
        <span
          data-testid="evidence-price-net"
          title={b ? `Net = ${NET_BASIS_LABEL[b.netBasis ?? 'amount_paid']} − tax − label costs. No marketplace fees.` : undefined}
          className={cn(
            RECORD_ID_CLASS,
            query.isError ? 'text-mode-warn' : net == null ? 'text-mode-muted' : net < 0 ? STATE_TONE_CLASSES.danger.text : STATE_TONE_CLASSES.success.text,
          )}
        >
          {query.isError ? 'Unreadable' : b == null ? '…' : net == null ? '—' : `Net ${formatCurrency(net)}${b.incomplete ? '*' : ''}`}
        </span>
      </div>
      {b ? (
        <dl className="flex flex-col px-4">
          {b.lines.length > 0 ? (
            <Fact label="Items">
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
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', linesOpen && 'rotate-90')} aria-hidden />
              </button>
            </Fact>
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
            <Fact label="Adjust.">
              <span className={RECORD_ID_CLASS}>{formatCurrency(b.adjustments)}</span>
            </Fact>
          ) : null}
          {b.saleAmount != null ? (
            <Fact label="Sale">
              <span className={RECORD_ID_CLASS}>{formatCurrency(b.saleAmount)}</span>
            </Fact>
          ) : null}
          {b.source === 'shipstation' ? (
            <>
              <Fact label="Shipping">
                <span className={RECORD_ID_CLASS}>{dash(b.shippingCharged)}</span>
              </Fact>
              <Fact label="Tax">
                <span className={RECORD_ID_CLASS}>{dash(b.tax)}</span>
              </Fact>
              <Fact label="Total">
                <span className={RECORD_ID_CLASS}>{dash(b.orderTotal)}</span>
              </Fact>
              <Fact label="Paid">
                <span className={RECORD_PRICE_CLASS}>{dash(b.amountPaid)}</span>
              </Fact>
            </>
          ) : null}
          {LABEL_PURPOSES.filter((p) => b.labelCostByPurpose[p] != null).map((p) => (
            <Fact key={p} label={`${LABEL_PURPOSE_FACE[p].code} label${b.labels.filter((l) => l.purpose === p).length > 1 ? 's' : ''}`}>
              <span className={cn(RECORD_ID_CLASS, STATE_TONE_CLASSES.danger.text)} data-testid={`evidence-price-label-${p}`}>
                {debit(b.labelCostByPurpose[p]!)}
              </span>
            </Fact>
          ))}
          <Fact label="Net">
            <span className="flex min-w-0 flex-col py-1">
              <span className={cn(RECORD_ID_CLASS, 'font-black', net != null && net < 0 ? STATE_TONE_CLASSES.danger.text : 'text-mode-ink')}>
                {dash(net)}
              </span>
              <span className={cn(RECORD_LABEL_CLASS, 'normal-case tracking-normal text-mode-muted')}>
                {b.netBasis ? NET_BASIS_LABEL[b.netBasis] : 'paid'} − tax − label costs · no marketplace fees
              </span>
            </span>
          </Fact>
          {b.gaps.length > 0 ? (
            <p className={cn(RECORD_LABEL_CLASS, 'normal-case tracking-normal py-2 text-mode-warn')} data-testid="evidence-price-gaps">
              * {b.gaps.join(' · ')}
            </p>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
