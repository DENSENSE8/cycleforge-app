'use client';

/**
 * Take payment — the right-rail panel for one order (operator 2026-09-27).
 *
 * Everything on it is read from the server by order number
 * (`/api/orders/payments`): the order's lines and totals, the Square payment
 * link or invoice, and its live status. The artifact that opened it carries no
 * money and no URL, so nothing a model typed can become an amount or a link.
 *
 * Card details are never entered here. Staff copy the link, show the QR code,
 * or open Square's hosted checkout in a new window to key the card there.
 * Status moves pending → paid through the Square webhook; while the panel is
 * open it also polls with `refresh=1`, which asks Square directly (throttled
 * server-side) in case a webhook was missed.
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Link2, Receipt, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { AI_FOCUS_CLASS } from '@/design-system/ai';
import type { ArtifactPayment } from '@/lib/assistant/ui-artifacts';
import type { OrderPaymentPanel, OrderPaymentView } from '@/lib/order-payments/service';
import type { OrderPaymentStatus, PaymentLine } from '@/lib/order-payments/model';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cn } from '@/utils/_cn';

const QRCode = dynamic(() => import('react-qr-code'), { ssr: false });

const POLL_MS = 4000;

type Method = 'square_link' | 'square_invoice';

const STATUS_FACE: Record<OrderPaymentStatus, { label: string; tone: string }> = {
  pending: { label: 'Waiting for payment', tone: 'text-text-warning' },
  sent: { label: 'Ready to share — waiting for payment', tone: 'text-text-warning' },
  paid: { label: 'Paid', tone: 'text-text-success' },
  failed: { label: 'Could not be created', tone: 'text-text-danger' },
  cancelled: { label: 'Cancelled', tone: 'text-text-faint' },
  refunded: { label: 'Refunded', tone: 'text-text-faint' },
};

const METHOD_LABEL: Record<Method, string> = { square_link: 'Payment link', square_invoice: 'Invoice' };

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

type PanelResponse = { ok: true } & OrderPaymentPanel;

export function PaymentArtifact({ artifact }: { artifact: ArtifactPayment }) {
  const [panel, setPanel] = useState<OrderPaymentPanel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'cancel' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [tab, setTab] = useState<Method>(artifact.method ?? 'square_link');
  const [copied, setCopied] = useState(false);
  const orderNumber = artifact.orderNumber;
  const alive = useRef(true);

  const load = useCallback(
    async (refresh: boolean) => {
      try {
        const res = await fetch(
          `/api/orders/payments?orderNumber=${encodeURIComponent(orderNumber)}${refresh ? '&refresh=1' : ''}`,
          { cache: 'no-store' },
        );
        const body = (await res.json().catch(() => null)) as PanelResponse | { ok: false; error?: string } | null;
        if (!alive.current) return;
        if (!res.ok || !body || body.ok !== true) {
          setLoadError((body && 'error' in body && body.error) || 'Could not load this order.');
          return;
        }
        setLoadError(null);
        setPanel(body);
      } catch {
        if (alive.current) setLoadError('Could not reach the server.');
      }
    },
    [orderNumber],
  );

  const payment = panel?.payment ?? null;
  const open = payment !== null && (payment.status === 'pending' || payment.status === 'sent');

  useEffect(() => {
    alive.current = true;
    void load(true);
    return () => {
      alive.current = false;
    };
  }, [load]);

  // Live status while a request is collecting.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, load]);

  // The open request's method is the tab the panel shows.
  const openMethod = open && payment && payment.method !== 'square_terminal' ? payment.method : null;
  useEffect(() => {
    if (openMethod) setTab(openMethod);
  }, [openMethod]);

  const create = async (method: Method) => {
    setBusy('create');
    setActionError(null);
    try {
      const res = await fetch('/api/orders/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, method, idempotencyKey: safeRandomUUID() }),
      });
      const body = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) setActionError(body?.error || 'Square did not accept the request.');
      await load(false);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (id: number) => {
    setBusy('cancel');
    setActionError(null);
    try {
      const res = await fetch('/api/orders/payments/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const body = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) setActionError(body?.error || 'Could not cancel it in Square.');
      setConfirmCancel(false);
      await load(false);
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setActionError('Copy failed — select the link and copy it.');
    }
  };

  if (!panel) {
    return (
      <div className="px-4 py-3 text-role-caption" data-artifact-payment>
        {loadError ? <p className="text-text-danger">{loadError}</p> : <p className="text-text-faint">Loading order {orderNumber}…</p>}
      </div>
    );
  }

  // What is (or would be) charged: the request's own snapshot, else the order's live lines.
  const currency = payment?.currency ?? panel.order?.currency ?? 'USD';
  const lines: PaymentLine[] = payment?.lines.length ? payment.lines : panel.order?.lines ?? [];
  const total = payment?.amountCents ?? panel.order?.totalCents ?? 0;
  const shown = payment && (payment.method === tab || open) ? payment : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto" data-artifact-payment data-payment-status={payment?.status ?? 'none'}>
      <section className="border-b border-border-hairline px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-role-caption text-text-faint">
            Order <span className="font-mono text-text-default">{panel.orderNumber}</span>
            {panel.customer?.name ? <> · {panel.customer.name}</> : null}
          </p>
          {payment ? (
            <span className={cn('text-role-caption font-semibold', STATUS_FACE[payment.status].tone)} data-payment-status-label>
              {payment.status === 'paid' ? <Check className="mr-1 inline h-3.5 w-3.5" /> : null}
              {STATUS_FACE[payment.status].label}
            </span>
          ) : (
            <span className="text-role-caption text-text-faint">Not requested yet</span>
          )}
        </div>
        {panel.orderError ? <p className="mt-2 text-role-caption text-text-danger">{panel.orderError}</p> : null}
        {lines.length > 0 ? (
          <table className="mt-2 w-full border-collapse text-left text-role-caption" aria-label="Order lines">
            <tbody>
              {lines.map((line, i) => (
                <tr key={`${line.sku ?? ''}-${i}`}>
                  <td className="py-1 pr-2 text-text-default">
                    {line.title}
                    {line.sku ? <span className="block text-role-micro text-text-faint">{line.sku}</span> : null}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-2 text-right text-text-faint">
                    {line.qty} × {money(line.unitPriceCents, currency)}
                  </td>
                  <td className="whitespace-nowrap py-1 text-right text-text-default">{money(line.lineCents, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <dl className="mt-2 space-y-0.5 border-t border-border-hairline pt-2 text-role-caption">
          <div className="flex justify-between text-text-faint">
            <dt>Subtotal</dt>
            <dd>{money(panel.order?.subtotalCents ?? total, currency)}</dd>
          </div>
          <div className="flex justify-between text-text-faint">
            <dt>Shipping</dt>
            <dd>{money(panel.order?.shippingCents ?? 0, currency)}</dd>
          </div>
          <div className="flex justify-between text-text-faint">
            <dt>Tax</dt>
            <dd>{money(panel.order?.taxCents ?? 0, currency)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-text-default">
            <dt>Total</dt>
            <dd data-payment-total>{money(total, currency)}</dd>
          </div>
        </dl>
      </section>

      <section className="px-4 py-3">
        <div role="tablist" aria-label="Payment method" className="mb-3 flex gap-1">
          {(['square_link', 'square_invoice'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={tab === m}
              disabled={openMethod !== null && openMethod !== m}
              onClick={() => setTab(m)}
              className={cn(
                'ds-raw-button inline-flex items-center gap-1.5 rounded-ai-chip px-3 py-1 text-ai-label transition-colors duration-150 disabled:opacity-40',
                AI_FOCUS_CLASS,
                tab === m ? 'border border-ai-line-strong bg-ai-hover text-ai-ink' : 'text-ai-muted hover:bg-ai-hover hover:text-ai-ink',
              )}
            >
              {m === 'square_link' ? <Link2 className="h-3.5 w-3.5" /> : <Receipt className="h-3.5 w-3.5" />}
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>

        {shown && shown.url && shown.status !== 'cancelled' && shown.status !== 'failed' ? (
          <PaymentLinkBlock payment={shown} copied={copied} onCopy={copy} />
        ) : null}

        {shown?.status === 'paid' ? (
          <p className="mt-3 text-role-caption text-text-success">
            Paid {shown.paidAt ? new Date(shown.paidAt).toLocaleString() : ''} — Square has the receipt.
          </p>
        ) : null}
        {shown && open && !shown.url && shown.squareInvoiceUrl ? (
          <div className="flex flex-col gap-2" data-payment-draft>
            <p className="text-role-caption text-text-warning">Drafted in Square — not sent yet.</p>
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                onClick={() => window.open(shown.squareInvoiceUrl as string, '_blank', 'noopener,noreferrer')}
              >
                Open in Square
              </Button>
            </div>
          </div>
        ) : null}
        {shown?.lastError && shown.status !== 'cancelled' && shown.status !== 'paid' ? (
          <p className={cn('mt-2 text-role-caption', shown.status === 'failed' ? 'text-text-danger' : 'text-text-warning')}>{shown.lastError}</p>
        ) : null}

        {!open && panel.order && payment?.status !== 'paid' ? (
          <div className="mt-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={busy === 'create'}
              disabled={busy !== null}
              onClick={() => void create(tab)}
            >
              {tab === 'square_link' ? 'Create payment link' : 'Create invoice'}
            </Button>
            <p className="mt-2 text-role-micro text-text-faint">
              {tab === 'square_link'
                ? 'Square makes a secure checkout page for this total. Send the link, show the QR code, or open it to key the card on Square.'
                : 'Square makes an invoice for this total addressed to the customer on the order. Share its link; Square sends nothing on its own.'}
            </p>
          </div>
        ) : null}

        {open && payment ? (
          <div className="mt-4 flex items-center gap-2">
            {confirmCancel ? (
              <>
                <Button type="button" variant="danger" size="sm" loading={busy === 'cancel'} disabled={busy !== null} onClick={() => void cancel(payment.id)}>
                  {payment.method === 'square_invoice' ? 'Yes, cancel the invoice' : 'Yes, delete the link'}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => setConfirmCancel(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={() => setConfirmCancel(true)}>
                Cancel
              </Button>
            )}
          </div>
        ) : null}

        {actionError && actionError !== shown?.lastError ? <p className="mt-2 text-role-caption text-text-danger">{actionError}</p> : null}
        {loadError && panel ? <p className="mt-2 text-role-micro text-text-faint">Live status paused: {loadError}</p> : null}

        <p className="mt-4 text-role-micro text-text-faint">
          Card details are only ever entered on Square&apos;s secure page — never in this app or in chat.
        </p>
      </section>
    </div>
  );
}

function PaymentLinkBlock({
  payment,
  copied,
  onCopy,
}: {
  payment: OrderPaymentView;
  copied: boolean;
  onCopy: (text: string) => void;
}) {
  const url = payment.url as string;
  const invoice = payment.method === 'square_invoice';
  return (
    <div className="flex flex-col gap-3" data-payment-link>
      <div className="flex items-center gap-2 rounded-ai-chip border border-border-hairline px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-role-caption text-text-default" title={url} data-payment-url>
          {url}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          onClick={() => onCopy(url)}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      {payment.status !== 'paid' ? (
        <div className="flex items-start gap-3">
          <div className="rounded-ai-chip bg-white p-2" aria-label={`QR code for the ${invoice ? 'invoice' : 'payment'} link`} data-payment-qr>
            <QRCode value={url} size={128} />
          </div>
          <p className="text-role-micro text-text-faint">
            The customer scans this with a phone camera to pay on Square&apos;s page.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {payment.status !== 'paid' ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer,width=520,height=820')}
          >
            {invoice ? 'Open invoice page' : 'Open Square checkout'}
          </Button>
        ) : null}
        {payment.squareInvoiceUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => window.open(payment.squareInvoiceUrl as string, '_blank', 'noopener,noreferrer')}
          >
            Open in Square
          </Button>
        ) : null}
      </div>
    </div>
  );
}
