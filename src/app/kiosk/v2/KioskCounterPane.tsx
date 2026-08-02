'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
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
import { safeRandomUUID } from '@/lib/safe-uuid';

interface KioskCounterPaneProps {
  selectedItems: SelectedItem[];
  selectedProduct: ProductSelection | null;
  onReset: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Landscape right-pane counter transaction.
 *
 * Cart SoT is `CounterDraft.retailLines` (same as `CounterIntakeForm`) — and as
 * of 2026-08-02 it is the only counter cart. This used to read "not
 * `salesCartStore`, which remains the staff `/pickup` walk-in cart"; `/pickup`
 * never imported that store either, and it was deleted with zero consumers.
 * Submit posts to `/api/kiosk/intake` with `serviceLine` + Idempotency-Key.
 */
export function KioskCounterPane({ selectedItems, selectedProduct, onReset }: KioskCounterPaneProps) {
  const [draft, setDraft] = useState<CounterDraft>(emptyCounterDraft);
  const [showOrderLookup, setShowOrderLookup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CounterTransactionResult | null>(null);
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
              price: '',
              repairReasons: d.service?.repairReasons ?? [],
              repairNotes: d.service?.repairNotes ?? '',
              signatureDataUrl: d.signatureDataUrl,
              signatureStrokes: d.signatureStrokes,
            }
          : null,
      };
    });
  }, [selectedItems, selectedProduct]);

  const patch = (next: Partial<CounterDraft>) => setDraft((d) => ({ ...d, ...next }));

  const totals = useMemo(
    () => computeCounterTotals({ retailLines: draft.retailLines, service: draft.service }),
    [draft.retailLines, draft.service],
  );

  const blockReason = useMemo(() => {
    if (!hasAnyLine(draft)) return 'Select items from the catalog on the left.';
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

  const submit = async (takePayment: boolean) => {
    if (submitting || blockReason) return;
    setSubmitting(true);
    setError(null);
    if (!idemKey.current) idemKey.current = safeRandomUUID();
    try {
      const res = await fetch('/api/kiosk/intake', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idemKey.current,
        },
        body: JSON.stringify({
          service: 'sales',
          customer: {
            phone: draft.phone,
            name: draft.name || null,
            email: draft.email || null,
          },
          retailLines: draft.retailLines,
          serviceLine: draft.service
            ? {
                ...draft.service,
                signatureDataUrl: draft.signatureDataUrl,
                signatureStrokes: draft.signatureStrokes,
              }
            : null,
          priorOrder: draft.priorOrderNumber.trim()
            ? { orderNumber: draft.priorOrderNumber.trim(), phone: draft.phone }
            : null,
          ticketWork: draft.service ? { mode: 'create' } : { mode: 'none' },
          takePayment,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        transaction?: CounterTransactionResult;
        error?: string;
      };

      if (res.status === 403 && body.error?.includes('STEPUP')) {
        throw new Error('A manager needs to authorize payment on this tablet.');
      }
      if (!res.ok || !body.transaction) {
        throw new Error(body.error?.trim() || 'Transaction failed');
      }
      idemKey.current = null;
      setResult(body.transaction);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete this transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
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
          <ul className="max-w-md space-y-1 rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-800">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <Button
          size="lg"
          onClick={() => {
            setResult(null);
            setDraft(emptyCounterDraft());
            onReset();
          }}
        >
          Next Customer
        </Button>
      </div>
    );
  }

  const SECTION_LABEL = 'text-role-micro uppercase tracking-[0.16em] text-text-soft';

  return (
    <div className="mx-auto w-full max-w-2xl space-y-10 pb-20">
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border-soft pb-2">
          <h3 className={SECTION_LABEL}>1. Order Details</h3>
          <span className="text-xl font-semibold tracking-tight">{formatCents(totals.totalCents)}</span>
        </div>

        {draft.retailLines.length === 0 && !draft.service ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface-card p-6 text-center text-sm font-semibold text-text-soft">
            Select items from the left rail to add them to this order.
          </div>
        ) : (
          <ul className="divide-y divide-border-soft rounded-xl border border-border-soft bg-surface-card px-4">
            {draft.service && (
              <li className="flex items-baseline justify-between gap-3 py-4">
                <span className="min-w-0 font-semibold">
                  {draft.service.productModel}
                  <span className="ml-2 text-role-eyebrow uppercase tracking-widest text-text-soft">
                    Service
                  </span>
                </span>
              </li>
            )}
            {draft.retailLines.map((line) => (
              <li
                key={line.variationId ?? line.productTitle}
                className="flex items-baseline justify-between gap-3 py-4"
              >
                <span className="min-w-0 font-semibold">
                  {line.productTitle}
                  {line.quantity > 1 && <span className="ml-2 text-text-soft">×{line.quantity}</span>}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatCents(line.unitAmountCents * line.quantity)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {draft.service && (
          <div className="space-y-3 rounded-xl border border-border-soft bg-surface-card p-4">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-text-soft">
              Service Item Info
            </h4>
            <TextField
              label="Serial number"
              value={draft.service.serialNumber}
              mono
              onChange={(v) => patch({ service: { ...draft.service!, serialNumber: v } })}
            />
            <TextField
              label="What needs fixing?"
              value={draft.service.repairNotes ?? ''}
              onChange={(v) => patch({ service: { ...draft.service!, repairNotes: v } })}
            />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className={SECTION_LABEL}>2. Customer Information</h3>
        <div className="space-y-4 rounded-xl border border-border-soft bg-surface-card p-5">
          <TextField
            label="Phone number"
            value={draft.phone}
            onChange={(v) => patch({ phone: v })}
            inputMode="tel"
            autoComplete="tel"
          />
          <TextField
            label="Name"
            value={draft.name}
            onChange={(v) => patch({ name: v })}
            autoComplete="name"
          />
          <TextField
            label="Email (optional)"
            value={draft.email}
            onChange={(v) => patch({ email: v })}
            inputMode="email"
            autoComplete="email"
          />
          {showOrderLookup ? (
            <TextField
              label="Order number"
              value={draft.priorOrderNumber}
              onChange={(v) => patch({ priorOrderNumber: v })}
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
        <section className="space-y-4">
          <h3 className={SECTION_LABEL}>3. Authorization</h3>
          <div className="rounded-xl border border-border-soft bg-surface-card p-5">
            <SignaturePad
              variant="dropoff"
              label="Sign to authorize the service"
              allowFullscreen
              onSignatureChange={onSignature}
            />
          </div>
        </section>
      )}

      <section className="space-y-3 border-t border-border-soft pt-6 text-center">
        {error && <p className="font-semibold text-text-danger">{error}</p>}
        {blockReason && !error && (
          <p className="text-sm font-semibold text-text-soft">{blockReason}</p>
        )}
        <div className="flex gap-3">
          <Button
            size="lg"
            className="flex-1"
            disabled={submitting || !!blockReason}
            onClick={() => void submit(true)}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              'Pay at register'
            )}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            disabled={submitting || !!blockReason}
            onClick={() => void submit(false)}
          >
            Save (No payment)
          </Button>
        </div>
        <p className="text-xs uppercase tracking-widest text-text-faint">
          Card details are never entered on this tablet.
        </p>
      </section>
    </div>
  );
}
