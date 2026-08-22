'use client';

/**
 * CounterIntakeForm — the 4-step front-desk counter transaction.
 *
 * ## Why this is a SIBLING of RepairIntakeForm, not an extension of it
 *
 * doc 05 §1 leaves the choice open. A counter *transaction* is a different job
 * from a repair *intake*: it can be retail-only (no product, no serial, no
 * signature), it carries a cart, and it ends in a payment hand-off.
 * `RepairIntakeForm` is also the STAFF repair path, so extending it to four steps
 * would push cart and payment concerns into a surface that has neither.
 * `.claude/rules/pattern-evolution.md` is explicit that a genuinely different job
 * earns a new sibling **that composes the shared primitives** — which is what
 * this does for `ProductSelector`. It never did for the cart: this line used to
 * name `salesCartStore` as composed-not-forked, but the counter has always held
 * its own `CounterDraft.retailLines` and imported nothing from that store, which
 * had zero consumers and was deleted 2026-08-02.
 *
 * ## This is a FORM, not a Station
 *
 * `contextual-display.md` Q1 sends scanner-driven surfaces to Station. **There is
 * no scanner at the counter** (`foh-boh-surface-split-plan.md`: "The counter is a
 * form, not a scanner station"), so: no scan bar, no focus-lock loop, no
 * `StationWorkbench` chrome. Step motion uses the house `tabPagerVariants` for a
 * genuine multi-step wizard — `auth-step-panel.md`'s progressive-reveal
 * supersession covers the 2-field credential case, not a 4-step flow whose
 * earlier input (a cart) cannot share the screen with a signature pad.
 *
 * ## It never charges
 *
 * The last step STAGES and hands off. No card number is entered, accepted, or
 * displayed here under any framing.
 *
 * Copy uses capability nouns, never vendor product names
 * (`.claude/rules/source-of-truth.md` → integrations).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Button, Panel, TextField } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { X, Check, Loader2 } from '@/components/Icons';
import {
  framerTransition,
  tabPagerVariants,
} from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { ProductSelector, type ProductSelection, type SelectedItem } from '@/components/repair/ProductSelector';
import { SignaturePad, type SignatureData } from '@/components/repair/SignaturePad';
import {
  computeCounterTotals,
  type CounterTransactionInput,
  type CounterTransactionResult,
} from '@/lib/counter/counter-transaction-types';
import {
  COUNTER_STEP_META,
  activeServiceLine,
  blockingReason,
  emptyCounterDraft,
  needsSignature,
  nextStep,
  prevStep,
  stepIndex,
  type CounterDraft,
  type CounterStep,
} from './counter-intake-steps';
import {
  KioskPaymentStepUpSheet,
  type KioskPaymentStepUpResult,
} from '@/components/kiosk/KioskPaymentStepUpSheet';

interface CounterIntakeFormProps {
  onClose: () => void;
  /**
   * Submits the transaction. Receives everything except the idempotency key,
   * which the host mints and re-sends on retry.
   */
  onSubmit: (
    input: Omit<CounterTransactionInput, 'clientEventId'>,
    opts: { takePayment: boolean; staffId?: number; pin?: string },
  ) => Promise<CounterTransactionResult>;
  /** Route prefix for the catalog pair. Sales kiosk passes `/api/kiosk/sales`. */
  apiBasePath?: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CounterIntakeForm({ onClose, onSubmit, apiBasePath }: CounterIntakeFormProps) {
  const [step, setStep] = useState<CounterStep>('identity');
  const [direction, setDirection] = useState(1);
  const [draft, setDraft] = useState<CounterDraft>(emptyCounterDraft);
  const [showOrderLookup, setShowOrderLookup] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductSelection | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [servicePrice, setServicePrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CounterTransactionResult | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const _liveRegionRef = useRef<HTMLParagraphElement>(null);

  const pagerTransition = useMotionTransition(framerTransition.tabPager);

  const patch = useCallback((next: Partial<CounterDraft>) => {
    setDraft((d) => ({ ...d, ...next }));
  }, []);

  const totals = useMemo(
    () => // The draft form holds ONE device (one `service`, one signature); it
      // contributes a one-element list rather than being widened here.
      computeCounterTotals({
        retailLines: draft.retailLines,
        services: draft.service ? [draft.service] : [],
      }),
    [draft.retailLines, draft.service],
  );

  const blocked = blockingReason(step, draft);
  // The service line ONLY once it names a real product — a picker mid-drill
  // reports a partial selection. Reading it through the accessor also narrows the
  // type, so the fields below need no non-null assertions.
  const service = activeServiceLine(draft);

  const go = useCallback((to: CounterStep, dir: number) => {
    setDirection(dir);
    setError(null);
    setStep(to);
  }, []);

  const advance = useCallback(() => {
    if (blocked) {
      setError(blocked);
      return;
    }
    go(nextStep(step), 1);
  }, [blocked, go, step]);

  const back = useCallback(() => {
    if (step === 'identity') {
      onClose();
      return;
    }
    go(prevStep(step), -1);
  }, [go, onClose, step]);

  /**
   * Fold the picker's selection into the draft's single service line.
   *
   * A selection with a BLANK model is not a service. `ProductSelector` reports a
   * partial selection while the operator is still drilling categories, and
   * treating that as a service line let the Continue gate pass on an empty visit,
   * demanded a signature for a product nobody had chosen, and would have posted
   * `productModel: ''` straight into a server validation error.
   */
  const applyService = useCallback(
    (product: ProductSelection | null, price: string) => {
      if (!product || !product.model?.trim()) {
        patch({ service: null });
        return;
      }
      patch({
        service: {
          productType: product.type || null,
          productModel: product.model,
          sourceSku: product.sourceSku ?? null,
          serialNumber: draft.service?.serialNumber ?? '',
          price: price || draft.service?.price || '',
          repairReasons: draft.service?.repairReasons ?? [],
          repairNotes: draft.service?.repairNotes ?? '',
          signatureDataUrl: draft.signatureDataUrl,
          signatureStrokes: draft.signatureStrokes,
        },
      });
    },
    [draft.service, draft.signatureDataUrl, draft.signatureStrokes, patch],
  );

  const onSignature = useCallback(
    (data: SignatureData | null) => {
      patch({
        signatureDataUrl: data?.dataUrl ?? null,
        signatureStrokes: data?.strokes ?? null,
      });
    },
    [patch],
  );

  const submit = useCallback(
    async (opts: { takePayment: boolean; staffId?: number; pin?: string }) => {
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await onSubmit(
          {
            customer: {
              phone: draft.phone,
              name: draft.name || null,
              email: draft.email || null,
            },
            retailLines: draft.retailLines,
            services: draft.service
              ? [
                  {
                    ...draft.service,
                    signatureDataUrl: draft.signatureDataUrl,
                    signatureStrokes: draft.signatureStrokes,
                  },
                ]
              : [],
            priorOrder: draft.priorOrderNumber.trim()
              ? { orderNumber: draft.priorOrderNumber.trim(), phone: draft.phone }
              : null,
            ticketWork: draft.service ? { mode: 'create' } : { mode: 'none' },
          },
          opts,
        );
        setResult(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not complete this transaction.');
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [draft, onSubmit, submitting],
  );

  const onStepUpAuthorized = useCallback(
    async (creds: KioskPaymentStepUpResult) => {
      try {
        await submit({
          takePayment: true,
          staffId: creds.staffId,
          pin: creds.pin,
        });
        setStepUpOpen(false);
        return { ok: true as const };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not complete this transaction.';
        if (message.includes('PIN incorrect')) {
          return { ok: false as const, error: message };
        }
        setStepUpOpen(false);
        return { ok: false as const, error: message };
      }
    },
    [submit],
  );

  // ── Done ──────────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
        <span
          className={cn(
            'flex h-16 w-16 items-center justify-center bg-emerald-50 text-emerald-600',
            cornerClass('canvas'),
          )}
        >
          <Check className="h-8 w-8" />
        </span>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">All set</h2>
          <p className="text-role-caption font-semibold text-text-soft">
            {result.repairs[0]?.rsNumber
              ? `Service ${result.repairs[0]!.rsNumber} checked in.`
              : 'Sale staged at the register.'}
          </p>
        </div>
        {result.warnings.length > 0 && (
          <ul
            className={cn(
              'max-w-md space-y-1 border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-left text-role-caption font-semibold text-amber-800',
              cornerClass('card'),
            )}
          >
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <Button size="lg" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  const currentIndex = stepIndex(step);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card">
      {/* Chrome stays OUTSIDE the pager — a header that animates with the body
          reads as the whole app moving, and the step dots must not slide. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border-soft px-4 py-3 sm:px-6">
        <IconButton
          size="md"
          ariaLabel={step === 'identity' ? 'Cancel' : 'Back'}
          onClick={back}
          icon={<X className="h-4 w-4" />}
        />
        <div className="min-w-0 flex-1">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            Front desk
          </p>
          <h1 className="truncate text-role-title font-semibold tracking-tight">
            {COUNTER_STEP_META[currentIndex]?.label}
          </h1>
        </div>
        <ol className="flex shrink-0 items-center gap-1.5" aria-label="Progress">
          {COUNTER_STEP_META.map((meta, i) => (
            <li
              key={meta.id}
              aria-current={i === currentIndex ? 'step' : undefined}
              className={cn(
                'h-1.5 rounded-full transition-[width,background-color] duration-200',
                i === currentIndex ? 'w-6 bg-blue-500' : 'w-1.5',
                i < currentIndex ? 'bg-blue-300' : i > currentIndex && 'bg-border-default',
              )}
            >
              <span className="sr-only">{meta.label}</span>
            </li>
          ))}
        </ol>
      </header>

      {/* Single-cell grid so both panels overlap during the swap without a
          height glitch (the tabPagerVariants contract). */}
      <div className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden">
        <AnimatePresence mode="sync" custom={direction} initial={false}>
          <motion.section
            key={step}
            custom={direction}
            variants={tabPagerVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pagerTransition}
            className="col-start-1 row-start-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6"
          >
            {step === 'identity' && (
              <div className="mx-auto w-full max-w-md space-y-4">
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

                {/* Deterministic only: no customer list, no search. The device
                    principal is unattended-capable, so anything one key reveals a
                    stranger can reveal. */}
                {showOrderLookup ? (
                  <TextField
                    label="Order number"
                    value={draft.priorOrderNumber}
                    onChange={(v) => patch({ priorOrderNumber: v })}
                  />
                ) : (
                  /* ds-raw-button — quiet text affordance, not a Button variant */
                  <button
                    type="button"
                    onClick={() => setShowOrderLookup(true)}
                    className={cn(
                      'min-h-11 text-role-caption font-semibold text-text-soft transition-colors hover:text-text-default',
                      focusRing('control', 'accent'),
                    )}
                  >
                    Have an order number?
                  </button>
                )}
              </div>
            )}

            {step === 'cart' && (
              <div className="mx-auto w-full max-w-2xl space-y-6">
                <section className="space-y-2">
                  <h2 className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                    Service
                  </h2>
                  {/* Composed, not forked. `flowInPage` keeps the results from
                      nesting a second scrollbar on a tablet. */}
                  <ProductSelector
                    apiBasePath={apiBasePath}
                    hideManualEntry
                    flowInPage
                    selectedProduct={selectedProduct}
                    onSelect={(p) => {
                      setSelectedProduct(p);
                      applyService(p, servicePrice);
                    }}
                    onPriceChange={(price) => {
                      setServicePrice(price);
                      if (selectedProduct) applyService(selectedProduct, price);
                    }}
                    selectedItems={selectedItems}
                    onSelectedItemsChange={(items) => {
                      setSelectedItems(items);
                      // Extra picked items are RETAIL lines: they carry a price
                      // and a sku but no serial, so they are goods, not services.
                      setDraft((d) => ({
                        ...d,
                        retailLines: items.map((item) => ({
                          variationId: item.id,
                          sku: item.sku,
                          productTitle: item.name,
                          quantity: 1,
                          unitAmountCents: Math.round((item.price ?? 0) * 100),
                        })),
                      }));
                    }}
                  />
                </section>

                {service && (
                  <section className="space-y-3">
                    <h2 className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                      Service details
                    </h2>
                    <TextField
                      label="Serial number"
                      value={service.serialNumber}
                      mono
                      onChange={(v) => patch({ service: { ...service, serialNumber: v } })}
                    />
                    <TextField
                      label="What needs fixing?"
                      value={service.repairNotes ?? ''}
                      onChange={(v) => patch({ service: { ...service, repairNotes: v } })}
                    />
                  </section>
                )}
              </div>
            )}

            {step === 'review' && (
              <div className="mx-auto w-full max-w-md space-y-5">
                <Panel padding="md">
                  <ul className="divide-y divide-border-soft">
                    {service && (
                      <li className="flex items-baseline justify-between gap-3 py-2">
                        <span className="min-w-0 truncate text-role-caption font-semibold">
                          {service.productModel}
                          <span className="ml-2 text-role-eyebrow uppercase tracking-widest text-text-soft">
                            Service
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums font-semibold">
                          {formatCents(totals.totalCents - totals.subtotalCents)}
                        </span>
                      </li>
                    )}
                    {draft.retailLines.map((line) => (
                      <li
                        key={line.variationId ?? line.productTitle}
                        className="flex items-baseline justify-between gap-3 py-2"
                      >
                        <span className="min-w-0 truncate text-role-caption font-semibold">
                          {line.productTitle}
                          {line.quantity > 1 && (
                            <span className="ml-2 text-text-soft">×{line.quantity}</span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums font-semibold">
                          {formatCents(line.unitAmountCents * line.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-baseline justify-between border-t border-border-default pt-3">
                    <span className="text-role-eyebrow uppercase tracking-widest text-text-soft">
                      Total
                    </span>
                    <span className="text-xl font-semibold tabular-nums">
                      {formatCents(totals.totalCents)}
                    </span>
                  </div>
                  <p className="mt-2 text-role-micro uppercase tracking-widest text-text-soft">
                    Taxes are calculated at the register.
                  </p>
                </Panel>

                {/* ONLY when a service line exists. A retail-only sale must never
                    demand a service agreement. */}
                {needsSignature(draft) && (
                  <section className="space-y-2">
                    <SignaturePad
                      variant="dropoff"
                      label="Sign to authorize the service"
                      onSignatureChange={onSignature}
                    />
                  </section>
                )}
              </div>
            )}

            {step === 'payment' && (
              <div className="mx-auto w-full max-w-md space-y-4 text-center">
                <p className="text-role-caption font-semibold text-text-soft">
                  {formatCents(totals.totalCents)} due
                </p>
                <div className="space-y-3">
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={submitting}
                    onClick={() => {
                      setError(null);
                      setStepUpOpen(true);
                    }}
                  >
                    Take payment at the register
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    disabled={submitting}
                    onClick={() => void submit({ takePayment: false }).catch(() => {})}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                      </>
                    ) : (
                      'Save without payment'
                    )}
                  </Button>
                </div>
                <p className="text-role-micro uppercase tracking-widest text-text-soft">
                  Card details are never entered on this tablet.
                </p>
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      <footer className="shrink-0 space-y-2 border-t border-border-soft px-4 py-3 sm:px-6">
        <p
          aria-live="polite"
          className={cn(
            'min-h-5 text-center text-role-caption font-semibold',
            error ? 'text-text-danger' : 'text-text-soft',
          )}
        >
          {error ?? (blocked && step !== 'payment' ? blocked : '')}
        </p>
        {step !== 'payment' && (
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="lg" onClick={back}>
              {step === 'identity' ? 'Cancel' : 'Back'}
            </Button>
            <Button size="lg" onClick={advance} disabled={!!blocked}>
              Continue
            </Button>
          </div>
        )}
      </footer>

      <KioskPaymentStepUpSheet
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onAuthorized={onStepUpAuthorized}
      />
    </div>
  );
}
