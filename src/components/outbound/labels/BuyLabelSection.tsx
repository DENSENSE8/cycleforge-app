'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Check, Loader2, RefreshCw, Clock, AlertTriangle, Trash2, Printer } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { LABEL_PURPOSES, LABEL_PURPOSE_FACE, type LabelPurpose } from '@/lib/shipping/label-purpose';
import { orderLabelPdfSrc, orderPriceBreakdownKey } from '@/components/outbound/orders/order-labels-client';
import { sendWithBuyerNoteAck } from '@/lib/orders/buyer-note-ack-client';
import { outboundDocumentContentSrc } from '@/lib/documents/outbound-document-display';
import {
  orderLabelSummaryKey,
  pickOrderDocument,
  printDocument,
  useOrderDocuments,
} from '@/lib/orders/order-paperwork-client';

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
  purpose?: LabelPurpose;
  purchaseId?: number;
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

/** Buy Label — the ShipStation rate-shop → purchase → print flow for the Outbound · Labels order panel. */
export function BuyLabelSection({
  orderId,
  orderRef,
  onChange,
  weightOz = null,
  dimensions = null,
  onRatesError,
  onPurchased,
}: BuyLabelSectionProps) {
  // Mode corners: a card / a control in triage, square on the floor.
  const face = 'rounded-mode';
  const faceSm = 'rounded-mode-control';
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  // Why this label is bought:
  const [purpose, setPurpose] = useState<LabelPurpose>('outbound');
  // The evidence column's Label block reads the purchase ledger; a buy or a
  // void changes it.
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [bought, setBought] = useState<BuyResponse | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidOpen, setVoidOpen] = useState(false);
  // One idempotency key per INTENDED purchase:
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
          purpose,
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
            notifyCustomer: purpose !== 'return' && notifyCustomer,
            purpose,
            // A return is bought from its (swapped) shipment, not the rate id:
            // the server re-rates nothing — it rebuilds the shipment it quoted.
            ...(purpose === 'return'
              ? {
                  carrierId: rate.carrierId,
                  serviceCode: rate.serviceCode,
                  ...(weightOz != null && weightOz > 0 ? { weightOz } : {}),
                  ...(dimensions ? { dimensions } : {}),
                }
              : {}),
          }),
        }),
      );
      const data = (await res.json()) as BuyResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || 'Purchase failed.');
      return data;
    },
    onSuccess: (data) => {
      setBought(data);
      void queryClient.invalidateQueries({ queryKey: orderLabelSummaryKey(orderId) });
      void queryClient.invalidateQueries({ queryKey: orderPriceBreakdownKey(orderId) });
      setConfirming(false);
      onChange();
      // The label run advances on the order's shipment — a return or a
      // replacement bought mid-run is a side story on the same order.
      if ((data.purpose ?? purpose) === 'outbound') onPurchased?.(data);
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
      void queryClient.invalidateQueries({ queryKey: orderLabelSummaryKey(orderId) });
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
  const labelDoc = pickOrderDocument(orderDocuments, 'shipping_label', bought?.labelDocumentId ?? null);
  const slipDoc = pickOrderDocument(orderDocuments, 'packing_slip', null);
  // A return is never stored as the order's label document (it would print in
  // place of the outbound label) — it prints from ShipStation via the label proxy.
  const labelSrc =
    bought?.purpose === 'return' && bought.purchaseId
      ? orderLabelPdfSrc(orderId, bought.purchaseId)
      : outboundDocumentContentSrc(labelDoc);
  const slipSrc = bought?.purpose === 'return' ? null : outboundDocumentContentSrc(slipDoc);

  /** A new purpose is a new shipment: new rates, a new purchase key. */
  const choosePurpose = (next: LabelPurpose) => {
    if (next === purpose) return;
    setPurpose(next);
    setSelectedRateId(null);
    setConfirming(false);
    clientEventIdRef.current = '';
    ratesMutation.reset();
  };

  const rates = ratesMutation.data?.rates ?? [];
  const invalidRates = ratesMutation.data?.invalidRates ?? [];
  const selectedRate = rates.find((r) => r.rateId === selectedRateId) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="mode-label text-text-soft">Buy label</h3>
        {rates.length > 0 && !bought ? (
          <button /* ds-raw-button: custom rate-shop control (selectable rate card / micro eyebrow action) */
            type="button"
            onClick={() => ratesMutation.mutate()}
            disabled={ratesMutation.isPending}
            className="-my-0.5 flex items-center gap-1 rounded-mode-pill px-2 py-0.5 text-role-caption text-text-faint hover:bg-surface-hover hover:text-text-accent disabled:opacity-40"
          >
            {ratesMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        ) : null}
      </div>
      {!bought ? (
        <div
          className="inline-flex w-full items-center gap-0.5 rounded-mode-control bg-surface-sunken p-0.5"
          role="radiogroup"
          aria-label="Label purpose"
          data-testid="buy-label-purpose"
        >
          {LABEL_PURPOSES.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={purpose === p}
              disabled={buyMutation.isPending}
              data-testid={`buy-label-purpose-${p}`}
              onClick={() => choosePurpose(p)}
              className={cn(
                'inline-flex h-7 flex-1 items-center justify-center rounded-mode-control px-2.5 text-role-caption font-medium transition-colors',
                purpose === p ? 'bg-surface-card text-text-default shadow-elev-soft' : 'text-text-muted hover:text-text-default',
                focusRing('control'),
              )}
            >
              {LABEL_PURPOSE_FACE[p].label}
            </button>
          ))}
        </div>
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        {/* ── Success ───────────────────────────────────────────────────── */}
        {bought ? (
          <motion.div key="bought" {...paneMotion} className="space-y-2">
            <div className={`${face} border border-border-success bg-surface-success px-3 py-2.5`}>
              <div className="flex items-center gap-1.5 text-text-success">
                <Check className="h-4 w-4" />
                <span className="text-role-caption font-semibold">
                  {bought.idempotent ? 'Label already purchased' : 'Label purchased'}
                  {bought.purpose && bought.purpose !== 'outbound' ? ` · ${LABEL_PURPOSE_FACE[bought.purpose].label}` : ''}
                </span>
              </div>
              <dl className="mt-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <dt className="mode-label text-text-success opacity-70">Tracking</dt>
                  <dd className="truncate font-mono text-role-caption font-semibold text-text-default">{bought.tracking}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="mode-label text-text-success opacity-70">Carrier</dt>
                  <dd className="text-role-caption font-semibold text-text-default">{bought.carrier}</dd>
                </div>
                {typeof bought.cost === 'number' ? (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="mode-label text-text-success opacity-70">Cost</dt>
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
                <label className="mode-label block text-text-danger">Reason to void</label>
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
                className="flex items-center gap-1 text-role-caption text-text-faint hover:text-text-danger"
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
                className="mt-1 text-role-caption text-text-danger hover:underline"
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
                          <p className="truncate text-role-micro text-text-soft">
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
                          <span className="ml-1 shrink-0 rounded-mode-pill bg-surface-success px-2 py-0.5 text-role-micro font-medium leading-none text-text-success ring-1 ring-inset ring-border-success">
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
                    {selectedRate.carrierName} {selectedRate.serviceName}{' '}
                    {purpose === 'outbound' ? '' : `${LABEL_PURPOSE_FACE[purpose].label.toLowerCase()} `}label for {orderRef}?
                  </p>
                  {purpose === 'return' ? (
                    <p className="text-role-eyebrow text-text-muted">
                      Buyer → warehouse. Charged by the carrier’s default (most carriers bill only once it is scanned).
                    </p>
                  ) : (
                    <label className="flex items-center gap-1.5 text-role-eyebrow font-semibold text-text-muted">
                      <input
                        type="checkbox"
                        checked={notifyCustomer}
                        onChange={(e) => setNotifyCustomer(e.target.checked)}
                        className="h-3.5 w-3.5 rounded-sm border-border-default text-text-accent"
                      />
                      Email the customer a tracking notification
                    </label>
                  )}
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
              {purpose === 'outbound' ? 'Get shipping rates' : `Get ${LABEL_PURPOSE_FACE[purpose].label.toLowerCase()} rates`}
            </Button>
            <p className="mt-1 px-1 text-role-eyebrow text-text-faint">
              {purpose === 'return'
                ? `Rate-shop a return — buyer to warehouse — for ${orderRef}.`
                : `Rate-shop live carrier prices for ${orderRef}.`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
