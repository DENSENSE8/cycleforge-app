'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { useMutation } from '@tanstack/react-query';
import { Truck, Check, Loader2, RefreshCw, Clock, AlertTriangle, Trash2, Printer } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { sendWithBuyerNoteAck } from '@/lib/orders/buyer-note-ack-client';
import { outboundDocumentContentSrc } from '@/lib/documents/outbound-document-display';
import type { OutboundDocument } from '@/lib/documents/types';
import {
  printDocument,
  useOrderDocuments,
} from '@/components/outbound/orders/paperwork/order-paperwork-client';

interface RatesResponse {
  ok: boolean;
  rates?: ShippingRateOption[];
  invalidRates?: Array<{ carrierCode?: string | null; serviceCode?: string | null; message: string }>;
  error?: string;
  code?: string;
}

interface BuyResponse {
  ok: boolean;
  tracking?: string;
  carrier?: string;
  service?: string;
  cost?: number;
  currency?: string;
  labelId?: string;
  labelUrl?: string | null;
  shipmentId?: number | null;
  labelDocumentId?: number | null;
  warning?: string | null;
  idempotent?: boolean;
  error?: string;
}

function money(amount: number | undefined, currency = 'USD'): string {
  if (typeof amount !== 'number') return '—';
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

function eta(rate: ShippingRateOption): string {
  if (typeof rate.deliveryDays === 'number' && rate.deliveryDays > 0) {
    return `${rate.deliveryDays} day${rate.deliveryDays > 1 ? 's' : ''}`;
  }
  if (rate.carrierDeliveryDays) return `${rate.carrierDeliveryDays} days`;
  if (rate.estimatedDeliveryDate) {
    const d = new Date(rate.estimatedDeliveryDate);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return '—';
}

interface BuyLabelSectionProps {
  orderId: number;
  orderRef: string;
  /** Called after a purchase or void so the parent refreshes the document tray. */
  onChange: () => void;
  /**
   * Station flush host — square faces (`cornerClass('flush')`) so Buy Label matches
   * Unbox pinned chrome under Labels Documents.
   */
  flush?: boolean;
  /**
   * Parcel weight (oz) from the bound order/form — sent on the rate request so
   * the quote reflects the operator's scale, not a stale stored weight.
   */
  weightOz?: number | null;
  /** Parcel dimensions from the bound order/form (dim-weight pricing). */
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'inch' | 'centimeter';
  } | null;
  /**
   * Rate-shop failure escape hatch: the host learns WHY rates failed (e.g.
   * `SHIPSTATION_NOT_CONNECTED`) so it can flip its fulfillment channel to
   * link-only instead of leaving the operator on a dead Buy path.
   */
  onRatesError?: (info: { code: string | null; message: string }) => void;
  /**
   * A purchase SUCCEEDED (buy only — never fired on void). `onChange` still
   * fires for both; this is for hosts that advance on a committed buy (the
   * To-ship label run). Omit everywhere else.
   */
  onPurchased?: (info: BuyResponse) => void;
}

/** The document this purchase stored, else the newest of that type on the order. */
function pickDocument(
  documents: readonly OutboundDocument[],
  type: OutboundDocument['documentType'],
  preferId: number | null,
): OutboundDocument | null {
  if (preferId != null) {
    const exact = documents.find((d) => d.id === preferId);
    if (exact) return exact;
  }
  const ofType = documents.filter((d) => d.documentType === type);
  if (ofType.length === 0) return null;
  return ofType.reduce((a, b) => (Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a));
}

/**
 * Buy Label — the ShipStation rate-shop → purchase → print flow for the Outbound
 * · Labels order panel. Fetches live rates on demand, lets the operator pick one
 * (cheapest first), confirms the charge, and buys the label; the purchased label
 * + generated packing slip flow into the existing document tray + print view via
 * `onChange`. Includes an immediate void/refund on the success card.
 */
export function BuyLabelSection({
  orderId,
  orderRef,
  onChange,
  flush = false,
  weightOz = null,
  dimensions = null,
  onRatesError,
  onPurchased,
}: BuyLabelSectionProps) {
  const face = cornerClass(flush ? 'flush' : 'field');
  const faceSm = cornerClass(flush ? 'flush' : 'control');
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [bought, setBought] = useState<BuyResponse | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidOpen, setVoidOpen] = useState(false);
  // One idempotency key per INTENDED purchase: it survives re-rating, a
  // network retry and a page-level remount of the confirm step, so a retry can
  // only ever replay the purchase the server already recorded. A fresh key is
  // minted only after a confirmed void (the next buy is a new purchase).
  const clientEventIdRef = useRef<string>('');
  const purchaseKey = () => {
    if (!clientEventIdRef.current) clientEventIdRef.current = safeRandomUUID();
    return clientEventIdRef.current;
  };

  // `motionRole.swap.focus` — the pointer-driven focus-surface swap, taken as
  // one pair, then spread into the single props object this call site passes.
  const { presence, transition } = useMotionRole(motionRole.swap.focus);
  const paneMotion = { ...presence, transition };

  const ratesMutation = useMutation<RatesResponse, Error, void>({
    mutationFn: async () => {
      const res = await fetch('/api/shipping/order-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          // Only claim a parcel opinion when the host actually has one — an
          // absent key keeps the server's stored-parcel / ShipStation fallback.
          ...(weightOz != null && weightOz > 0 ? { weightOz } : {}),
          ...(dimensions ? { dimensions } : {}),
        }),
      });
      const data = (await res.json()) as RatesResponse;
      if (!res.ok || !data.ok) {
        onRatesError?.({ code: data.code ?? null, message: data.error || 'Could not fetch rates.' });
        throw new Error(data.error || 'Could not fetch rates.');
      }
      return data;
    },
    onSuccess: (data) => {
      setSelectedRateId(data.rates?.[0]?.rateId ?? null);
      setConfirming(false);
    },
  });

  const buyMutation = useMutation<BuyResponse, Error, ShippingRateOption>({
    mutationFn: async (rate) => {
      // A held order (buyer note) opens the note before the irreversible
      // purchase; the clientEventId is reused on retry — the route claims it
      // before charging, so a retry replays instead of buying again.
      const res = await sendWithBuyerNoteAck(() =>
        fetch('/api/shipping/order-labels/purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            rateId: rate.rateId,
            clientEventId: purchaseKey(),
            notifyCustomer,
          }),
        }),
      );
      const data = (await res.json()) as BuyResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || 'Purchase failed.');
      return data;
    },
    onSuccess: (data) => {
      setBought(data);
      setConfirming(false);
      onChange();
      onPurchased?.(data);
    },
  });

  const voidMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      if (!bought?.labelId) throw new Error('No label to void.');
      const res = await fetch('/api/shipping/order-labels/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          labelId: bought.labelId,
          reason: voidReason.trim(),
          shipmentId: bought.shipmentId ?? undefined,
          documentId: bought.labelDocumentId ?? undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; approved?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Void declined.');
      return data;
    },
    onSuccess: () => {
      clientEventIdRef.current = '';
      setBought(null);
      setVoidOpen(false);
      setVoidReason('');
      setSelectedRateId(null);
      ratesMutation.reset();
      onChange();
    },
  });

  // The bought label + generated slip land in the order's documents; print
  // them from here instead of sending the operator to another panel.
  const documentsQuery = useOrderDocuments(bought ? orderId : 0);
  const orderDocuments = documentsQuery.data?.documents ?? [];
  const labelDoc = pickDocument(orderDocuments, 'shipping_label', bought?.labelDocumentId ?? null);
  const slipDoc = pickDocument(orderDocuments, 'packing_slip', null);
  const labelSrc = outboundDocumentContentSrc(labelDoc);
  const slipSrc = outboundDocumentContentSrc(slipDoc);

  const rates = ratesMutation.data?.rates ?? [];
  const invalidRates = ratesMutation.data?.invalidRates ?? [];
  const selectedRate = rates.find((r) => r.rateId === selectedRateId) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-role-eyebrow uppercase tracking-widest text-text-soft">Buy Label</h3>
        {rates.length > 0 && !bought ? (
          <button /* ds-raw-button: custom rate-shop control (selectable rate card / micro eyebrow action) */
            type="button"
            onClick={() => ratesMutation.mutate()}
            disabled={ratesMutation.isPending}
            className={cn('-my-0.5 flex items-center gap-1 px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest text-text-faint hover:bg-surface-hover hover:text-text-accent disabled:opacity-40', cornerClass('chip'))}
          >
            {ratesMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        ) : null}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {/* ── Success ───────────────────────────────────────────────────── */}
        {bought ? (
          <motion.div key="bought" {...paneMotion} className="space-y-2">
            <div className={`${face} border border-border-success bg-surface-success px-3 py-2.5`}>
              <div className="flex items-center gap-1.5 text-text-success">
                <Check className="h-4 w-4" />
                <span className="text-role-caption font-semibold">
                  {bought.idempotent ? 'Label already purchased' : 'Label purchased'}
                </span>
              </div>
              <dl className="mt-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-role-eyebrow uppercase tracking-widest text-text-success opacity-70">Tracking</dt>
                  <dd className="truncate font-mono text-role-caption font-semibold text-text-default">{bought.tracking}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-role-eyebrow uppercase tracking-widest text-text-success opacity-70">Carrier</dt>
                  <dd className="text-role-caption font-semibold uppercase text-text-default">{bought.carrier}</dd>
                </div>
                {typeof bought.cost === 'number' ? (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-role-eyebrow uppercase tracking-widest text-text-success opacity-70">Cost</dt>
                    <dd className="text-role-caption font-semibold text-text-default">{money(bought.cost, bought.currency)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            {bought.warning ? (
              <div className={`flex items-start gap-1.5 ${faceSm} border border-dashed border-border-warning bg-surface-warning px-3 py-2 text-role-eyebrow text-text-warning`}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{bought.warning}</span>
              </div>
            ) : null}

            <div className="flex items-center gap-1.5" data-testid="buy-label-print-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1"
                icon={<Printer className="h-3.5 w-3.5" />}
                disabled={!labelSrc}
                data-testid="buy-label-print-label"
                onClick={() => labelSrc && printDocument(labelSrc)}
              >
                Print label
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1"
                icon={<Printer className="h-3.5 w-3.5" />}
                disabled={!slipSrc}
                data-testid="buy-label-print-slip"
                onClick={() => slipSrc && printDocument(slipSrc)}
              >
                Print slip
              </Button>
            </div>
            {!labelSrc && documentsQuery.isFetching ? (
              <p className="text-role-eyebrow text-text-faint">Loading the stored label…</p>
            ) : null}

            {/* Void / refund */}
            {voidOpen ? (
              <div className={`space-y-1.5 ${faceSm} border border-border-danger bg-surface-danger px-3 py-2.5`}>
                <label className="block text-role-eyebrow uppercase tracking-widest text-text-danger">Reason to void</label>
                <input
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. wrong service selected"
                  className={cn('w-full', faceSm, 'border border-border-danger bg-surface-card px-2.5 py-1.5 text-role-caption text-text-default outline-none', focusRing('field', 'danger'))}
                />
                {voidMutation.isError ? (
                  <p className="text-role-eyebrow text-text-danger">{voidMutation.error.message}</p>
                ) : null}
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setVoidOpen(false); setVoidReason(''); }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={!voidReason.trim() || voidMutation.isPending}
                    icon={voidMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => voidMutation.mutate()}
                    className="flex-1"
                  >
                    Void label
                  </Button>
                </div>
              </div>
            ) : (
              <button /* ds-raw-button: custom rate-shop control (selectable rate card / micro eyebrow action) */
                type="button"
                onClick={() => setVoidOpen(true)}
                className="flex items-center gap-1 text-role-eyebrow uppercase tracking-widest text-text-faint hover:text-text-danger"
              >
                <Trash2 className="h-3 w-3" /> Void / refund this label
              </button>
            )}
          </motion.div>
        ) : ratesMutation.isPending ? (
          /* ── Loading ────────────────────────────────────────────────── */
          <motion.div key="loading" {...paneMotion} className="flex items-center gap-2 px-1 py-3 text-role-caption text-text-soft">
            <Loader2 className="h-4 w-4 animate-spin text-text-accent" /> Fetching live rates…
          </motion.div>
        ) : ratesMutation.isError ? (
          /* ── Error ──────────────────────────────────────────────────── */
          <motion.div key="error" {...paneMotion}>
            <div className={`${face} border border-dashed border-border-danger bg-surface-danger px-4 py-4 text-center`}>
              <p className="text-role-caption font-semibold text-text-danger">{ratesMutation.error.message}</p>
              <button /* ds-raw-button: custom rate-shop control (selectable rate card / micro eyebrow action) */
                type="button"
                onClick={() => ratesMutation.mutate()}
                className="mt-1 text-role-eyebrow uppercase tracking-widest text-text-danger hover:underline"
              >
                Try again
              </button>
            </div>
          </motion.div>
        ) : rates.length > 0 || invalidRates.length > 0 ? (
          /* ── Rate list ──────────────────────────────────────────────── */
          <motion.div key="rates" {...paneMotion} className="space-y-2">
            {rates.length === 0 ? (
              <p className={`${faceSm} border border-dashed border-border-soft bg-surface-canvas px-3 py-4 text-center text-role-caption text-text-soft`}>
                No rates returned for this parcel.
              </p>
            ) : (
              <ul className="space-y-1">
                {rates.map((rate, i) => {
                  const selected = rate.rateId === selectedRateId;
                  return (
                    <li key={rate.rateId}>
                      <button /* ds-raw-button: custom rate-shop control (selectable rate card / micro eyebrow action) */
                        type="button"
                        onClick={() => setSelectedRateId(rate.rateId)}
                        className={`flex w-full items-center gap-2 ${faceSm} px-2.5 py-1.5 text-left transition-colors ${
                          selected ? 'bg-surface-accent ring-1 ring-inset ring-border-accent' : 'hover:bg-surface-hover'
                        }`}
                      >
                        <Truck className={`h-4 w-4 shrink-0 ${selected ? 'text-text-accent' : 'text-text-faint'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-role-caption font-semibold text-text-default">{rate.carrierName}</p>
                          <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                            {rate.serviceName}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-role-caption font-semibold tabular-nums text-text-default">{money(rate.amount, rate.currency)}</p>
                          <p className="flex items-center justify-end gap-0.5 text-role-eyebrow font-semibold text-text-faint">
                            <Clock className="h-2.5 w-2.5" /> {eta(rate)}
                          </p>
                        </div>
                        {i === 0 ? (
                          <span className={cn('ml-1 shrink-0 bg-surface-success px-1.5 py-0.5 text-role-eyebrow uppercase tracking-widest text-text-success ring-1 ring-inset ring-border-success leading-none', cornerClass('chip'))}>
                            Best
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {invalidRates.length > 0 ? (
              <p className="px-1 text-role-eyebrow text-text-faint">
                {invalidRates.length} carrier{invalidRates.length > 1 ? 's' : ''} couldn’t rate this parcel.
              </p>
            ) : null}

            {/* Buy / confirm bar */}
            {selectedRate ? (
              confirming ? (
                <div className={`space-y-2 ${face} border border-border-accent bg-surface-accent px-3 py-2.5`}>
                  <p className="text-role-caption font-semibold text-text-default">
                    Purchase this <span className="font-semibold">{money(selectedRate.amount, selectedRate.currency)}</span>{' '}
                    {selectedRate.carrierName} {selectedRate.serviceName} label?
                  </p>
                  <label className="flex items-center gap-1.5 text-role-eyebrow font-semibold text-text-muted">
                    <input
                      type="checkbox"
                      checked={notifyCustomer}
                      onChange={(e) => setNotifyCustomer(e.target.checked)}
                      className={cn('h-3.5 w-3.5 border-border-default text-text-accent', cornerClass('chip'))}
                    />
                    Email the customer a tracking notification
                  </label>
                  {buyMutation.isError ? (
                    <p className="text-role-eyebrow text-text-danger">{buyMutation.error.message}</p>
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirming(false)}
                      disabled={buyMutation.isPending}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      icon={buyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      disabled={buyMutation.isPending}
                      onClick={() => selectedRate && buyMutation.mutate(selectedRate)}
                      className="flex-1 bg-accent-bg text-text-inverse hover:bg-accent-hover"
                    >
                      Confirm & buy
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  icon={<Truck className="h-4 w-4" />}
                  onClick={() => setConfirming(true)}
                  className="w-full bg-accent-bg text-text-inverse hover:bg-accent-hover"
                >
                  Buy {money(selectedRate.amount, selectedRate.currency)} label
                </Button>
              )
            ) : null}
          </motion.div>
        ) : (
          /* ── Idle ───────────────────────────────────────────────────── */
          <motion.div key="idle" {...paneMotion}>
            <Button
              type="button"
              variant="secondary"
              icon={<Truck className="h-4 w-4" />}
              onClick={() => ratesMutation.mutate()}
              className="w-full"
            >
              Get shipping rates
            </Button>
            <p className="mt-1 px-1 text-role-eyebrow text-text-faint">Rate-shop live carrier prices for {orderRef}.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
