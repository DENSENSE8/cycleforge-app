'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Button, TextField } from '@/design-system/primitives';
import { Loader2, Check } from '@/components/Icons';
import { SignaturePad, type SignatureData } from '@/components/repair/SignaturePad';
import type { SelectedItem, ProductSelection } from '@/components/repair/ProductSelector';
import {
  computeCounterTotals,
  type CounterTransactionResult,
} from '@/lib/counter/counter-transaction-types';
import {
  emptyCounterDraft,
  needsSignature,
  hasAnyLine,
  phoneDigits,
  type CounterDraft,
} from '@/components/counter/counter-intake-steps';
import { buildKioskSalesIntakeBody } from '@/lib/counter/kiosk-intake-payload';
import {
  KioskPaymentStepUpSheet,
  type KioskPaymentStepUpResult,
} from '@/components/kiosk/KioskPaymentStepUpSheet';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  KIOSK_META,
  KIOSK_PANE_FOOTER_BAND,
  KIOSK_SECTION_LABEL,
} from '@/app/kiosk/kiosk-chrome';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

interface KioskCounterPaneProps {
  selectedItems: SelectedItem[];
  selectedProduct: ProductSelection | null;
  /** Catalog price from the left-rail selection — empty until a priced SKU is picked. */
  servicePrice: string;
  onReset: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const SECTION_LABEL = cn(
  'border-b border-border-hairline px-4 py-2',
  KIOSK_SECTION_LABEL,
);

/**
 * Landscape right-pane counter transaction.
 *
 * Cart SoT is `CounterDraft.retailLines` (same as `CounterIntakeForm`).
 * Submit posts to `/api/kiosk/intake` via `buildKioskSalesIntakeBody` + Idempotency-Key.
 * Pay-at-register requires device staff PIN step-up (never card data on tablet).
 */
export function KioskCounterPane({
  selectedItems,
  selectedProduct,
  servicePrice,
  onReset,
}: KioskCounterPaneProps) {
  const [draft, setDraft] = useState<CounterDraft>(emptyCounterDraft);
  const [showOrderLookup, setShowOrderLookup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CounterTransactionResult | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const idemKey = useRef<string | null>(null);

  useEffect(() => {
    setDraft((d) => {
      const isService = selectedProduct && selectedProduct.model.trim() !== '';

      return {
        ...d,
        retailLines: selectedItems.map((item) => ({
          variationId: item.id,
          sku: item.sku,
          productTitle: item.name,
          quantity: 1,
          unitAmountCents: Math.round((item.price ?? 0) * 100),
        })),
        service: isService
          ? {
              productType: selectedProduct.type || null,
              productModel: selectedProduct.model,
              sourceSku: selectedProduct.sourceSku ?? null,
              serialNumber: d.service?.serialNumber ?? '',
              // Catalog price only — never invent a default (kiosk-shell honesty).
              price: servicePrice.trim() || '',
              repairReasons: d.service?.repairReasons ?? [],
              repairNotes: d.service?.repairNotes ?? '',
              signatureDataUrl: d.signatureDataUrl,
              signatureStrokes: d.signatureStrokes,
            }
          : null,
      };
    });
  }, [selectedItems, selectedProduct, servicePrice]);

  const patch = (next: Partial<CounterDraft>) => setDraft((d) => ({ ...d, ...next }));

  const totals = useMemo(
    () => computeCounterTotals({ retailLines: draft.retailLines, service: draft.service }),
    [draft.retailLines, draft.service],
  );

  const blockReason = useMemo(() => {
    if (!hasAnyLine(draft)) return 'Select items from the catalog on the left.';
    if (draft.service && !draft.service.price.trim()) {
      return 'Selected service has no catalog price yet.';
    }
    if (!draft.phone.trim()) return 'Enter a phone number.';
    if (phoneDigits(draft.phone).length < 7) return 'Phone number looks incomplete.';
    if (needsSignature(draft) && !draft.signatureDataUrl) {
      return 'Signature required for service drop-off.';
    }
    return null;
  }, [draft]);

  const onSignature = (data: SignatureData | null) => {
    patch({
      signatureDataUrl: data?.dataUrl ?? null,
      signatureStrokes: data?.strokes ?? null,
    });
  };

  const postIntake = useCallback(
    async (opts: { takePayment: boolean; staffId?: number; pin?: string }) => {
      if (!idemKey.current) idemKey.current = safeRandomUUID();
      const res = await fetch('/api/kiosk/intake', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idemKey.current,
        },
        body: JSON.stringify(buildKioskSalesIntakeBody(draft, opts)),
      });

      const body = (await res.json().catch(() => ({}))) as {
        transaction?: CounterTransactionResult;
        error?: string;
      };

      if (res.status === 403 && body.error === 'STEPUP_FAILED') {
        throw new Error('PIN incorrect. Try again.');
      }
      if (res.status === 403 && body.error?.includes('STEPUP')) {
        throw new Error('A manager needs to authorize payment on this tablet.');
      }
      if (!res.ok || !body.transaction) {
        throw new Error(body.error?.trim() || 'Transaction failed');
      }
      idemKey.current = null;
      return body.transaction;
    },
    [draft],
  );

  const submitSave = async () => {
    if (submitting || blockReason) return;
    setSubmitting(true);
    setError(null);
    try {
      const tx = await postIntake({ takePayment: false });
      setResult(tx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete this transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const onStepUpAuthorized = useCallback(
    async (creds: KioskPaymentStepUpResult) => {
      try {
        const tx = await postIntake({
          takePayment: true,
          staffId: creds.staffId,
          pin: creds.pin,
        });
        setStepUpOpen(false);
        setResult(tx);
        return { ok: true as const };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not complete this transaction.';
        // Keep pad open for PIN retries; surface other failures on the pane.
        if (message.includes('PIN incorrect')) {
          return { ok: false as const, error: message };
        }
        setStepUpOpen(false);
        setError(message);
        return { ok: false as const, error: message };
      }
    },
    [postIntake],
  );

  if (result) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <span
            className={cn(
              'flex h-16 w-16 items-center justify-center bg-emerald-50 text-emerald-600',
              cornerClass('flush'),
            )}
          >
            <Check className="h-8 w-8" />
          </span>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">All set</h2>
            <p className="font-semibold text-text-soft">
              {result.repair?.rsNumber
                ? `Service ${result.repair.rsNumber} checked in.`
                : 'Sale staged at the register.'}
            </p>
          </div>
          {result.warnings?.length > 0 && (
            <ul className="w-full max-w-md space-y-1 border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-800">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
        <div className={KIOSK_PANE_FOOTER_BAND} data-kiosk-footer-band>
          <Button
            size="lg"
            className={cn('h-full min-h-0 w-full flex-1 rounded-none', cornerClass('flush'))}
            onClick={() => {
              setResult(null);
              setDraft(emptyCounterDraft());
              onReset();
            }}
          >
            Next Customer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-0">
        <div className="flex w-full flex-col divide-y divide-border-hairline">
          <section>
            <div className="flex items-center justify-between border-b border-border-hairline px-4 py-2">
              <h3 className={KIOSK_SECTION_LABEL}>1. Order Details</h3>
              <span className="text-lg font-semibold tracking-tight tabular-nums">
                {formatCents(totals.totalCents)}
              </span>
            </div>

            {draft.retailLines.length === 0 && !draft.service ? (
              <div className="bg-surface-card px-4 py-6 text-center text-sm font-semibold text-text-soft">
                Select items from the left rail to add them to this order.
              </div>
            ) : (
              <ul className="divide-y divide-border-hairline bg-surface-card">
                {draft.service && (
                  <li className="flex items-baseline justify-between gap-3 px-4 py-4">
                    <span className="min-w-0 font-semibold">
                      {draft.service.productModel}
                      <span className={cn('ml-2 uppercase tracking-widest', KIOSK_META)}>
                        Service
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {draft.service.price.trim()
                        ? `$${Number.parseFloat(draft.service.price).toFixed(2)}`
                        : '—'}
                    </span>
                  </li>
                )}
                {draft.retailLines.map((line) => (
                  <li
                    key={line.variationId ?? line.productTitle}
                    className="flex items-baseline justify-between gap-3 px-4 py-4"
                  >
                    <span className="min-w-0 font-semibold">
                      {line.productTitle}
                      {line.quantity > 1 && (
                        <span className="ml-2 text-text-soft">×{line.quantity}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatCents(line.unitAmountCents * line.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {draft.service && (
              <div className="space-y-3 border-t border-border-hairline bg-surface-card px-4 py-4">
                <h4 className={KIOSK_SECTION_LABEL}>Service Item Info</h4>
                <TextField
                  label="Serial number"
                  value={draft.service.serialNumber}
                  mono
                  appearance="flush"
                  onChange={(v) => patch({ service: { ...draft.service!, serialNumber: v } })}
                />
                <TextField
                  label="What needs fixing?"
                  value={draft.service.repairNotes ?? ''}
                  appearance="flush"
                  onChange={(v) => patch({ service: { ...draft.service!, repairNotes: v } })}
                />
              </div>
            )}
          </section>

          <section>
            <h3 className={SECTION_LABEL}>2. Customer Information</h3>
            <div className="space-y-4 bg-surface-card px-4 py-4">
              <TextField
                label="Phone number"
                value={draft.phone}
                onChange={(v) => patch({ phone: v })}
                inputMode="tel"
                autoComplete="tel"
                appearance="flush"
              />
              <TextField
                label="Name"
                value={draft.name}
                onChange={(v) => patch({ name: v })}
                autoComplete="name"
                appearance="flush"
              />
              <TextField
                label="Email (optional)"
                value={draft.email}
                onChange={(v) => patch({ email: v })}
                inputMode="email"
                autoComplete="email"
                appearance="flush"
              />
              {showOrderLookup ? (
                <TextField
                  label="Order number"
                  value={draft.priorOrderNumber}
                  onChange={(v) => patch({ priorOrderNumber: v })}
                  appearance="flush"
                />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOrderLookup(true)}
                  className="text-sm font-semibold text-text-soft hover:text-text-default"
                >
                  Have an order number?
                </Button>
              )}
            </div>
          </section>

          {needsSignature(draft) && (
            <section>
              <h3 className={SECTION_LABEL}>3. Authorization</h3>
              <div className="bg-surface-card px-4 py-4">
                <SignaturePad
                  variant="dropoff"
                  label="Sign to authorize the service"
                  allowFullscreen
                  onSignatureChange={onSignature}
                />
              </div>
            </section>
          )}

          {(error || blockReason) && (
            <section className="space-y-1 px-4 py-3">
              {error && <p className="text-center font-semibold text-text-danger">{error}</p>}
              {blockReason && !error && (
                <p className="text-center text-sm font-semibold text-text-soft">{blockReason}</p>
              )}
            </section>
          )}
        </div>
      </div>

      <div className={KIOSK_PANE_FOOTER_BAND} data-kiosk-footer-band>
        <Button
          size="lg"
          className={cn('h-full min-h-0 flex-1 rounded-none', cornerClass('flush'))}
          disabled={submitting || !!blockReason}
          onClick={() => {
            setError(null);
            setStepUpOpen(true);
          }}
        >
          Pay at register
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className={cn('h-full min-h-0 flex-1 rounded-none', cornerClass('flush'))}
          disabled={submitting || !!blockReason}
          onClick={() => void submitSave()}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
            </>
          ) : (
            'Save (No payment)'
          )}
        </Button>
      </div>
      <p className={cn('border-t border-border-hairline px-4 py-2 text-center', KIOSK_META)}>
        Card details are never entered on this tablet.
      </p>

      <KioskPaymentStepUpSheet
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onAuthorized={onStepUpAuthorized}
      />
    </div>
  );
}
