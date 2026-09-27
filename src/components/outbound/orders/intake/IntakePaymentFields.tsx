'use client';

/**
 * Payment: what the order costs (from its lines) and how the customer pays —
 * a Square payment link or a Square invoice (`/api/orders/payments`, the
 * Square rail). Card numbers never touch CycleForge: "Take payment" hands the
 * customer a Square-hosted page. The request needs the saved order number.
 */

import { useCallback, useEffect, useState } from 'react';
import { Copy } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { formatCents, type ManualOrderTotals } from '@/lib/orders/manual-order-draft';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

type Method = 'square_link' | 'square_invoice';

const METHODS: ReadonlyArray<{ value: Method; label: string }> = [
  { value: 'square_link', label: 'Payment link' },
  { value: 'square_invoice', label: 'Invoice' },
];

const STATUS_LABEL: Record<string, string> = {
  pending: 'Link ready — not paid yet',
  sent: 'Sent — not paid yet',
  paid: 'Paid',
  failed: 'Payment failed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

interface PaymentView {
  method: Method | 'square_terminal';
  status: string;
  amountCents: number;
  currency: string;
  url: string | null;
}

export function IntakePaymentFields({
  totals,
  currency,
  orderNumber,
}: {
  totals: ManualOrderTotals;
  currency: string;
  /** The saved order's number; `null` before save. */
  orderNumber: string | null;
}) {
  const [method, setMethod] = useState<Method>('square_link');
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!orderNumber) return;
    const res = await fetch(`/api/orders/payments?orderNumber=${encodeURIComponent(orderNumber)}`, { credentials: 'same-origin' });
    const data = (await res.json().catch(() => null)) as { payment?: PaymentView | null } | null;
    setPayment(data?.payment ?? null);
  }, [orderNumber]);
  useEffect(() => {
    void load();
  }, [load]);

  const take = async () => {
    if (!orderNumber) return;
    setBusy(true);
    try {
      const res = await fetch('/api/orders/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderNumber, method, idempotencyKey: safeRandomUUID() }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; payment?: PaymentView } | null;
      if (!data?.ok || !data.payment) {
        toast.error(data?.error || 'Square could not take that payment request.');
        return;
      }
      setPayment(data.payment);
      toast.success(method === 'square_link' ? 'Payment link ready.' : 'Invoice sent.');
    } finally {
      setBusy(false);
    }
  };

  const rows: Array<[string, number]> = [
    ['Subtotal', totals.subtotalCents],
    ['Shipping', totals.shippingCents],
    ['Tax', totals.taxCents],
  ];

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
            {STATUS_LABEL[payment.status] ?? payment.status} · {formatCents(payment.amountCents, payment.currency)}
          </span>
          {payment.url ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<Copy className="size-3.5" />}
              onClick={() => void navigator.clipboard.writeText(payment.url!).then(() => toast.success('Link copied'))}
            >
              Copy link
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Payment method" className="inline-flex items-center gap-0.5 rounded-mode-control bg-surface-sunken p-0.5">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={method === m.value}
                onClick={() => setMethod(m.value)}
                className={cn(
                  'inline-flex h-8 items-center rounded-mode-control px-3 text-role-caption font-medium transition-colors',
                  method === m.value ? 'bg-surface-card text-text-default shadow-elev-soft' : 'text-text-muted hover:text-text-default',
                  focusRing('control'),
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            disabled={!orderNumber || !totals.priced}
            onClick={() => void take()}
            data-testid="intake-take-payment"
          >
            Take payment
          </Button>
          <p className="w-full text-role-caption text-text-muted">
            {orderNumber
              ? 'Square hosts the card entry — never type a card number here.'
              : 'Save the draft first — Square charges the saved order. Never type a card number here.'}
          </p>
        </div>
      )}
    </div>
  );
}
